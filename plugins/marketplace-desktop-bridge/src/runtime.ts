import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'

const PROFILE_NAME = 'web'
const RECOVERY_VERSION = 1
const RECOVERY_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'] as const
const MAX_RECOVERY_BYTES = 32 * 1024 * 1024
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u

type JsonObject = Record<string, unknown>

export interface AppInstallProfile {
  readonly name: string
  readonly dir: string
}

export interface AppInstallPnpmOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

export interface AppInstallPnpmHandle {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<AppInstallPnpmOutcome>
  cancel(): void
}

export interface AppInstallPnpm {
  runPlugin(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): AppInstallPnpmHandle
  runPluginInstall(
    args: readonly string[],
    invokingDir: string,
    recovery: {
      readonly packageName: string
      readonly packageVersion: string
      readonly receiptId: string
    },
    signal?: AbortSignal,
  ): Promise<AppInstallPnpmHandle>
  recoveredInstallReceiptIds(): Promise<readonly string[]>
  acknowledgeRecoveredInstall(receiptId: string): Promise<void>
  rollbackPluginInstall(receiptId: string): Promise<boolean>
}

interface RecoveryState {
  readonly version: 1
  readonly generationId: string
  readonly receiptId: string
  readonly packageName: string
  readonly packageVersion: string
  readonly profileDir: string
  readonly phase: 'prepared' | 'awaiting-restart' | 'rolled-back'
  readonly before: Readonly<Record<(typeof RECOVERY_FILES)[number], string | null>>
}

type SpawnProcess = typeof spawn

function errorCode(cause: unknown): string | undefined {
  return cause !== null && typeof cause === 'object' && 'code' in cause
    ? String((cause as { code?: unknown }).code)
    : undefined
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsedManifest(contents: string): JsonObject {
  const value: unknown = JSON.parse(contents)
  if (!isObject(value)) throw new Error('DeepDeck profile manifest is invalid')
  return value
}

function manifestBundles(manifest: JsonObject): string[] {
  const dsh = isObject(manifest.dsh) ? manifest.dsh : undefined
  const profile = dsh !== undefined && isObject(dsh.profile) ? dsh.profile : undefined
  const bundles = profile?.bundles
  if (bundles === undefined) return []
  if (!Array.isArray(bundles) || bundles.some(value => typeof value !== 'string')) {
    throw new Error('DeepDeck profile bundle list is invalid')
  }
  return [...bundles] as string[]
}

/** Keep a protected add from activating unrelated stale dependencies. */
export function restrictAddedProfileBundles(
  beforeContents: string | null,
  currentContents: string,
  targetPackageName: string,
): string | undefined {
  if (!PACKAGE_NAME_PATTERN.test(targetPackageName)) throw new Error('DeepDeck target package name is invalid')
  const before = beforeContents === null ? {} : parsedManifest(beforeContents)
  const current = parsedManifest(currentContents)
  const previous = new Set(manifestBundles(before))
  const bundles = manifestBundles(current)
  const restricted = bundles.filter(packageName => previous.has(packageName) || packageName === targetPackageName)
  if (restricted.length === bundles.length) return undefined
  const dsh = isObject(current.dsh) ? current.dsh : {}
  const profile = isObject(dsh.profile) ? dsh.profile : {}
  current.dsh = { ...dsh, profile: { ...profile, bundles: restricted } }
  return `${JSON.stringify(current, null, 2)}\n`
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, path)
}

async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (cause) {
    if (errorCode(cause) !== 'ENOENT') throw cause
  }
}

function parseRecoveryState(value: unknown): RecoveryState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DeepDeck App install recovery state is invalid')
  }
  const state = value as Record<string, unknown>
  if (
    state.version !== RECOVERY_VERSION
    || typeof state.generationId !== 'string'
    || typeof state.receiptId !== 'string'
    || typeof state.packageName !== 'string'
    || typeof state.packageVersion !== 'string'
    || typeof state.profileDir !== 'string'
    || !isAbsolute(state.profileDir)
    || !['prepared', 'awaiting-restart', 'rolled-back'].includes(String(state.phase))
    || state.before === null
    || typeof state.before !== 'object'
    || Array.isArray(state.before)
  ) throw new Error('DeepDeck App install recovery state is invalid')

  const before = state.before as Record<string, unknown>
  for (const filename of RECOVERY_FILES) {
    if (before[filename] !== null && typeof before[filename] !== 'string') {
      throw new Error('DeepDeck App install recovery snapshot is invalid')
    }
  }
  return state as unknown as RecoveryState
}

class InstallRecoveryStore {
  constructor(
    private readonly statePath: string,
    private readonly profileDir: string,
    private readonly generationId: string,
  ) {}

  async begin(input: {
    readonly packageName: string
    readonly packageVersion: string
    readonly receiptId: string
  }): Promise<void> {
    const existing = await this.read()
    if (existing !== undefined) {
      if (existing.generationId !== this.generationId && existing.phase === 'awaiting-restart') {
        // Starting another protected install from a new Host/Renderer generation
        // proves the previous installation restarted successfully. App installs do
        // not pass through a separate receipt reconciliation path, so
        // commit that successful transaction here as well.
        await this.clear()
      } else if (existing.phase === 'awaiting-restart') {
        throw new Error(
          `插件 ${existing.packageName}@${existing.packageVersion} 已安装，正在等待重启验证。请重启 DeepDeck 后再安装其他插件。`,
        )
      } else {
        throw new Error('上一笔受保护的插件安装仍在恢复处理中。请重启 DeepDeck 后重试。')
      }
    }
    const before = Object.fromEntries(await Promise.all(RECOVERY_FILES.map(async (filename) => {
      const path = join(this.profileDir, filename)
      return [filename, await exists(path) ? (await readFile(path)).toString('base64') : null]
    }))) as RecoveryState['before']
    await this.write({
      version: RECOVERY_VERSION,
      generationId: this.generationId,
      receiptId: input.receiptId,
      packageName: input.packageName,
      packageVersion: input.packageVersion,
      profileDir: this.profileDir,
      phase: 'prepared',
      before,
    })
  }

  async markAwaitingRestart(receiptId: string): Promise<void> {
    const state = await this.readExact(receiptId)
    await this.write({ ...state, phase: 'awaiting-restart' })
  }

  async rollback(receiptId: string): Promise<boolean> {
    const state = await this.read()
    if (state === undefined || state.receiptId !== receiptId) return false
    await this.restore(state)
    await this.write({ ...state, phase: 'rolled-back' })
    return true
  }

  async restrictAddedBundles(receiptId: string, packageName: string): Promise<void> {
    const state = await this.readExact(receiptId)
    const currentPath = join(this.profileDir, 'package.json')
    const current = await readFile(currentPath, 'utf8')
    const beforeEncoded = state.before['package.json']
    const restricted = restrictAddedProfileBundles(
      beforeEncoded === null ? null : Buffer.from(beforeEncoded, 'base64').toString('utf8'),
      current,
      packageName,
    )
    if (restricted !== undefined) await atomicWrite(currentPath, restricted)
  }

  async recoveredReceiptIds(): Promise<readonly string[]> {
    const state = await this.read()
    if (state === undefined) return []
    if (state.generationId === this.generationId) {
      return state.phase === 'rolled-back' ? [state.receiptId] : []
    }
    if (state.phase === 'awaiting-restart') {
      // Reaching the bridge in a new Cordis generation proves that the new
      // profile booted far enough to expose the App installer Host again.
      await this.clear()
      return []
    }
    if (state.phase === 'prepared') {
      await this.restore(state)
      await this.write({ ...state, phase: 'rolled-back' })
    }
    return [state.receiptId]
  }

  async acknowledge(receiptId: string): Promise<void> {
    const state = await this.read()
    if (state?.phase === 'rolled-back' && state.receiptId === receiptId) await this.clear()
  }

  private async readExact(receiptId: string): Promise<RecoveryState> {
    const state = await this.read()
    if (state === undefined || state.receiptId !== receiptId) {
      throw new Error('App install recovery transaction changed during installation')
    }
    return state
  }

  private async read(): Promise<RecoveryState | undefined> {
    let contents: Buffer
    try {
      contents = await readFile(this.statePath)
    } catch (cause) {
      if (errorCode(cause) === 'ENOENT') return undefined
      throw cause
    }
    if (contents.byteLength > MAX_RECOVERY_BYTES) {
      throw new Error('DeepDeck App install recovery state is too large')
    }
    return parseRecoveryState(JSON.parse(contents.toString('utf8')) as unknown)
  }

  private async write(state: RecoveryState): Promise<void> {
    await atomicWrite(this.statePath, `${JSON.stringify(state)}\n`)
  }

  private async restore(state: RecoveryState): Promise<void> {
    if (resolve(state.profileDir) !== resolve(this.profileDir)) {
      throw new Error('App install recovery profile no longer matches the active profile')
    }
    for (const filename of RECOVERY_FILES) {
      const path = join(this.profileDir, filename)
      const encoded = state.before[filename]
      if (encoded === null) {
        await removeFile(path)
      } else {
        const temporary = `${path}.${process.pid}.${randomUUID()}.restore`
        await writeFile(temporary, Buffer.from(encoded, 'base64'), { mode: 0o600 })
        await rename(temporary, path)
      }
    }
  }

  private async clear(): Promise<void> {
    await removeFile(this.statePath)
  }
}

function validateArgs(args: readonly string[]): string[] {
  if (args.length === 0 || args.some((argument) => argument.length === 0 || argument.includes('\0'))) {
    throw new Error('App installer plugin arguments are invalid')
  }
  return [...args]
}

function validateDirectory(path: string): string {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('App installer invoking directory is invalid')
  return resolve(path)
}

export function resolveDshHome(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.DSH_HOME?.trim()
  if (!configured) return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return resolve(homedir(), configured.slice(2))
  }
  return resolve(configured)
}

export function resolveAppInstallProfile(
  environment: NodeJS.ProcessEnv = process.env,
): AppInstallProfile {
  const home = resolveDshHome(environment)
  return Object.freeze({ name: PROFILE_NAME, dir: join(home, 'profiles', PROFILE_NAME) })
}

export class DeepDeckAppInstallPnpm implements AppInstallPnpm {
  private readonly generationId = randomUUID()
  private readonly recovery: InstallRecoveryStore
  private active: ChildProcess | undefined

  constructor(
    private readonly profile: AppInstallProfile,
    private readonly homeDir: string,
    private readonly nodeBinary: string,
    private readonly cliPath: string,
    statePath: string,
    private readonly spawnProcess: SpawnProcess = spawn,
  ) {
    if (!isAbsolute(profile.dir) || !isAbsolute(cliPath)) {
      throw new Error('DeepDeck App installer runtime paths must be absolute')
    }
    this.recovery = new InstallRecoveryStore(statePath, profile.dir, this.generationId)
  }

  runPlugin(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): AppInstallPnpmHandle {
    const resolvedArgs = validateArgs(args)
    if (resolvedArgs[0] === 'add') {
      throw new Error('App installs must use the protected install boundary')
    }
    return this.start(resolvedArgs, invokingDir, signal)
  }

  async runPluginInstall(
    args: readonly string[],
    invokingDir: string,
    recovery: {
      readonly packageName: string
      readonly packageVersion: string
      readonly receiptId: string
    },
    signal?: AbortSignal,
  ): Promise<AppInstallPnpmHandle> {
    const resolvedArgs = validateArgs(args)
    if (resolvedArgs[0] !== 'add') {
      throw new Error('Protected App installs require the add command')
    }
    signal?.throwIfAborted()
    await this.recovery.begin(recovery)
    let handle: AppInstallPnpmHandle
    try {
      handle = this.start(resolvedArgs, invokingDir, signal)
    } catch (cause) {
      await this.recovery.rollback(recovery.receiptId)
      throw cause
    }
    const done = handle.done.then(async (outcome) => {
      if (outcome.exitCode === 0 && outcome.signal === null) {
        try {
          await this.recovery.restrictAddedBundles(recovery.receiptId, recovery.packageName)
          await this.recovery.markAwaitingRestart(recovery.receiptId)
        } catch (cause) {
          await this.recovery.rollback(recovery.receiptId)
          throw cause
        }
      } else {
        await this.recovery.rollback(recovery.receiptId)
      }
      return outcome
    }, async (cause: unknown) => {
      await this.recovery.rollback(recovery.receiptId)
      throw cause
    })
    return { ...handle, done }
  }

  recoveredInstallReceiptIds(): Promise<readonly string[]> {
    return this.recovery.recoveredReceiptIds()
  }

  acknowledgeRecoveredInstall(receiptId: string): Promise<void> {
    return this.recovery.acknowledge(receiptId)
  }

  rollbackPluginInstall(receiptId: string): Promise<boolean> {
    return this.recovery.rollback(receiptId)
  }

  private start(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): AppInstallPnpmHandle {
    if (this.active !== undefined) throw new Error('Another App package operation is running')
    signal?.throwIfAborted()
    const child = this.spawnProcess(
      this.nodeBinary,
      [this.cliPath, 'plugin', '--profile', this.profile.name, ...args],
      {
        cwd: validateDirectory(invokingDir),
        env: { ...process.env, DSH_HOME: this.homeDir, CI: 'true' },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    if (child.stdout === null || child.stderr === null) {
      child.kill('SIGTERM')
      throw new Error('App package process has no output streams')
    }
    this.active = child
    let cancelled = false
    const cancel = (): void => {
      if (cancelled || child.exitCode !== null || child.signalCode !== null) return
      cancelled = true
      child.kill('SIGTERM')
    }
    const abort = (): void => cancel()
    signal?.addEventListener('abort', abort, { once: true })
    const done = new Promise<AppInstallPnpmOutcome>((resolveDone, rejectDone) => {
      child.once('error', rejectDone)
      child.once('exit', (exitCode, exitSignal) => resolveDone({ exitCode, signal: exitSignal }))
    }).finally(() => {
      signal?.removeEventListener('abort', abort)
      if (this.active === child) this.active = undefined
    })
    return { stdout: child.stdout, stderr: child.stderr, done, cancel }
  }
}
