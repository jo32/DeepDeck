import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  BunBuildLogs,
  BunBuildPreview,
  BunBuildResult,
  BunBuilderRuntimeStatus,
  BunHotUpdateResult,
  BunSourceBuildResult,
} from './api-types.js'

const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_SOURCE_FILES = 20_000
const MAX_SOURCE_FILE_BYTES = 64 * 1024 * 1024
const MAX_SOURCE_BYTES = 256 * 1024 * 1024
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000
const BUILD_TIMEOUT_MS = 10 * 60 * 1000
const PACK_TIMEOUT_MS = 2 * 60 * 1000
const PREVIEW_TTL_MS = 30 * 60 * 1000
const PREBUILT_BUILD_LABEL = 'Prebuilt package (no build script)'
const OMITTED_DIRECTORIES = new Set(['.git', '.pnpm-store', 'node_modules'])

type JsonObject = Record<string, unknown>

export interface BunBuildPreviewInput {
  readonly sourceDirectory: string
  readonly packageSubdirectory?: string
}

/** Lightweight source metadata used by settings surfaces; never snapshots the source tree. */
export interface BunBuildInspection {
  readonly packageName: string
  readonly hotUpdateAvailable: boolean
  readonly hotUpdateReason?: string
}

export interface BunBuildRequest {
  readonly previewId: string
  readonly confirmation: string
  readonly signal?: AbortSignal
}

export interface BunHotUpdateTarget {
  readonly packageName: string
  readonly sourcePackageRoot: string
  readonly hostEntryPath: string
  readonly clientEntryPath?: string
}

export interface BunHotUpdateAvailability {
  readonly available: boolean
  readonly reason?: string
}

export interface BunHotReloadAdapter {
  inspect(target: BunHotUpdateTarget): Promise<BunHotUpdateAvailability>
  reload(target: BunHotUpdateTarget): Promise<void>
}

export interface BunPluginBuilderService {
  isStatePath(path: string): boolean
  status(signal?: AbortSignal): Promise<BunBuilderRuntimeStatus>
  inspect(input: BunBuildPreviewInput, signal?: AbortSignal): Promise<BunBuildInspection>
  preview(input: BunBuildPreviewInput, signal?: AbortSignal): Promise<BunBuildPreview>
  build(input: BunBuildRequest): Promise<BunBuildResult>
  buildSource(input: BunBuildRequest): Promise<BunSourceBuildResult>
  hotUpdate(input: BunBuildRequest): Promise<BunHotUpdateResult>
  discard(previewId: string): Promise<void>
  close(): void
}

export interface ProcessRunOptions {
  readonly cwd: string
  readonly environment: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
  readonly timeoutMs: number
}

export interface ProcessRunOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly output: string
  readonly timedOut: boolean
}

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options: ProcessRunOptions,
) => Promise<ProcessRunOutcome>

export interface BunPluginBuilderOptions {
  readonly bunBinary?: string
  readonly stateRoot?: string
  readonly environment?: NodeJS.ProcessEnv
  readonly now?: () => number
  readonly runProcess?: ProcessRunner
  readonly hotReload?: BunHotReloadAdapter
}

interface PackagePlan {
  readonly packageName: string
  readonly version: string
  readonly buildScript?: string
  readonly packageKind: 'plugin' | 'bundle'
  readonly bundlePatch?: string
  readonly hostEntry: string
  readonly clientEntry?: string
}

interface BuildJob {
  readonly preview: BunBuildPreview
  readonly jobRoot: string
  readonly snapshotRoot: string
  readonly packageRoot: string
  readonly installRoot: string
  readonly sourceRoot: string
  readonly sourcePackageRoot: string
  readonly plan: PackagePlan
  state: 'ready' | 'building' | 'complete' | 'failed'
}

export class BunBuildFailure extends Error {
  constructor(
    message: string,
    readonly logs: Partial<BunBuildLogs>,
  ) {
    super(message)
    this.name = 'BunBuildFailure'
  }
}

export function isBunBuildFailure(value: unknown): value is BunBuildFailure {
  return value instanceof BunBuildFailure
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.replaceAll(/[\r\n\t]+/gu, ' ').slice(0, 500) || 'unknown error'
}

function appendOutput(current: string, chunk: Buffer | string): string {
  if (current.length >= MAX_PROCESS_OUTPUT_BYTES) return current
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
  const available = MAX_PROCESS_OUTPUT_BYTES - current.length
  return current + text.slice(0, available)
}

export const runProcess: ProcessRunner = async (command, args, options) => await new Promise((resolveRun, rejectRun) => {
  let output = ''
  let timedOut = false
  let settled = false
  let forceStopTimer: ReturnType<typeof setTimeout> | undefined
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.environment,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const finish = (callback: () => void): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (forceStopTimer !== undefined) clearTimeout(forceStopTimer)
    options.signal?.removeEventListener('abort', abort)
    callback()
  }
  const stop = (): void => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    forceStopTimer ??= setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 2_000)
  }
  const abort = (): void => stop()
  const timer = setTimeout(() => {
    timedOut = true
    stop()
  }, options.timeoutMs)
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  child.stdout?.on('data', chunk => { output = appendOutput(output, chunk as Buffer) })
  child.stderr?.on('data', chunk => { output = appendOutput(output, chunk as Buffer) })
  child.once('error', cause => finish(() => rejectRun(cause)))
  child.once('close', (exitCode, signal) => finish(() => resolveRun({ exitCode, signal, output, timedOut })))
})

function defaultDshHome(environment: NodeJS.ProcessEnv): string {
  const configured = environment.DSH_HOME?.trim()
  if (!configured) return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return resolve(homedir(), configured.slice(2))
  }
  return resolve(configured)
}

export function resolveBunBuilderStateRoot(environment: NodeJS.ProcessEnv = process.env): string {
  return join(defaultDshHome(environment), 'deepdeck', 'bun-plugin-builder')
}

function defaultBunBinary(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'bun', 'bin', 'bun.exe')
}

function validatePreviewId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(value)) throw new Error('build preview id is invalid')
  return value
}

function validatePackageSubdirectory(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  if (normalized.length === 0) return ''
  if (
    normalized.length > 512
    || normalized.includes('\\')
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || normalized.endsWith('/')
  ) throw new Error('package subdirectory is invalid')
  const segments = normalized.split('/')
  if (segments.some(segment => !/^[A-Za-z0-9@][A-Za-z0-9._@+-]*$/u.test(segment))) {
    throw new Error('package subdirectory is invalid')
  }
  return segments.join('/')
}

function validateRelativeFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new Error(`${label} is invalid`)
  }
  if (/[\u0000-\u001F\u007F]/u.test(value) || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) {
    throw new Error(`${label} is invalid`)
  }
  const normalized = value.startsWith('./') ? value.slice(2) : value
  const segments = normalized.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

function packageExportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!isObject(value)) return undefined
  if (typeof value.default === 'string') return value.default
  if (typeof value.import === 'string') return value.import
  if (isObject(value.import) && typeof value.import.default === 'string') return value.import.default
  return undefined
}

function parsePackagePlan(value: unknown): PackagePlan {
  if (!isObject(value)) throw new Error('package.json must contain a JSON object')
  const packageName = value.name
  const version = value.version
  if (
    typeof packageName !== 'string'
    || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(packageName)
  ) throw new Error('package name is not a canonical npm name')
  if (
    typeof version !== 'string'
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)
  ) throw new Error('package version is not an exact semantic version')

  const scripts = isObject(value.scripts) ? value.scripts : {}
  const rawBuildScript = scripts.build
  if (rawBuildScript !== undefined && (
    typeof rawBuildScript !== 'string'
    || rawBuildScript.trim().length === 0
    || rawBuildScript.length > 4096
    || rawBuildScript.includes('\0')
  )) {
    throw new Error('package build script is invalid')
  }
  const buildScript = typeof rawBuildScript === 'string' ? rawBuildScript : undefined

  const dsh = isObject(value.dsh) ? value.dsh : {}
  let bundlePatch: string | undefined
  if (dsh.bundle !== undefined) {
    if (!isObject(dsh.bundle)) throw new Error('dsh.bundle is invalid')
    bundlePatch = validateRelativeFile(dsh.bundle.patch, 'dsh.bundle.patch')
  }
  const exportsField = isObject(value.exports) ? value.exports : {}
  const hostEntry = validateRelativeFile(
    typeof value.main === 'string' ? value.main : packageExportTarget(exportsField['.']),
    'Host entry',
  )
  const clientTarget = packageExportTarget(exportsField['./client'])
  const clientEntry = clientTarget === undefined ? undefined : validateRelativeFile(clientTarget, 'Client entry')
  if (dsh.client !== undefined && clientEntry === undefined) {
    throw new Error('package declares dsh.client but exports no Client entry')
  }
  return {
    packageName,
    version,
    ...(buildScript === undefined ? {} : { buildScript }),
    packageKind: bundlePatch === undefined ? 'plugin' : 'bundle',
    ...(bundlePatch === undefined ? {} : { bundlePatch }),
    hostEntry,
    ...(clientEntry === undefined ? {} : { clientEntry }),
  }
}

async function readJson(path: string): Promise<unknown> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MANIFEST_BYTES) {
    throw new Error('package.json is missing, linked, or too large')
  }
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

async function regularFile(path: string, label: string): Promise<void> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} is not a regular file`)
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (cause) {
    if (isObject(cause) && cause.code === 'ENOENT') return false
    throw cause
  }
}

interface CopyBudget {
  files: number
  bytes: number
}

async function copySourceTree(source: string, destination: string, budget: CopyBudget): Promise<void> {
  const info = await lstat(source)
  if (info.isSymbolicLink()) throw new Error('source trees containing symbolic links are not supported')
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: 0o700 })
    const entries = await readdir(source, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (OMITTED_DIRECTORIES.has(entry.name)) continue
      await copySourceTree(join(source, entry.name), join(destination, entry.name), budget)
    }
    return
  }
  if (!info.isFile()) throw new Error('source trees may contain only regular files and directories')
  budget.files += 1
  budget.bytes += info.size
  if (
    budget.files > MAX_SOURCE_FILES
    || info.size > MAX_SOURCE_FILE_BYTES
    || budget.bytes > MAX_SOURCE_BYTES
  ) throw new Error('source tree exceeds the builder size limit')
  await copyFile(source, destination)
  await chmod(destination, info.mode & 0o777)
}

function isInside(parent: string, candidate: string): boolean {
  const fromParent = relative(parent, candidate)
  return fromParent === '' || (!fromParent.startsWith('..') && !isAbsolute(fromParent))
}

async function childEnvironment(
  base: NodeJS.ProcessEnv,
  bunBinary: string,
  cacheRoot: string,
): Promise<NodeJS.ProcessEnv> {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of [
    'LANG',
    'LC_ALL',
    'SSL_CERT_DIR',
    'SSL_CERT_FILE',
    'SYSTEMROOT',
    'COMSPEC',
    'PATHEXT',
    'TEMP',
    'TMP',
    'TMPDIR',
  ]) {
    if (base[key] !== undefined) environment[key] = base[key]
  }
  const commandDirectories = [dirname(bunBinary), dirname(process.execPath), base.PATH ?? '']
  if (process.platform !== 'win32') {
    const toolDirectory = join(cacheRoot, 'bin')
    const bunCommand = join(toolDirectory, 'bun')
    await mkdir(toolDirectory, { recursive: true, mode: 0o700 })
    await rm(bunCommand, { force: true })
    await symlink(bunBinary, bunCommand)
    commandDirectories.unshift(toolDirectory)
  }
  environment.PATH = commandDirectories
    .filter(Boolean)
    .join(delimiter)
  environment.CI = '1'
  environment.NO_COLOR = '1'
  environment.GIT_TERMINAL_PROMPT = '0'
  environment.HUSKY = '0'
  environment.BUN_INSTALL_CACHE_DIR = cacheRoot
  return environment
}

async function hashFile(path: string): Promise<string> {
  return await new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', rejectHash)
    stream.once('end', () => resolveHash(hash.digest('hex')))
  })
}

function stageFailure(stage: keyof BunBuildLogs, outcome: ProcessRunOutcome): BunBuildFailure {
  const reason = outcome.timedOut
    ? `${stage} timed out`
    : outcome.signal !== null
      ? `${stage} stopped with ${outcome.signal}`
      : `${stage} exited with code ${String(outcome.exitCode)}`
  return new BunBuildFailure(reason, { [stage]: outcome.output })
}

function validatePackFileList(output: string, plan: PackagePlan): void {
  const files = new Set<string>()
  for (const line of output.split(/\r?\n/u)) {
    const match = /^packed\s+\S+\s+(.+)$/u.exec(line)
    if (match?.[1] !== undefined) files.add(match[1].startsWith('./') ? match[1].slice(2) : match[1])
  }
  const required = ['package.json', plan.bundlePatch, plan.hostEntry, plan.clientEntry]
    .filter((value): value is string => value !== undefined)
  const missing = required.filter(path => !files.has(path))
  if (missing.length > 0) {
    throw new Error(`packed artifact omits required files: ${missing.join(', ')}`)
  }
}

export class DeepDeckBunPluginBuilder implements BunPluginBuilderService {
  private readonly bunBinary: string
  private readonly stateRoot: string
  private readonly environment: NodeJS.ProcessEnv
  private readonly now: () => number
  private readonly processRunner: ProcessRunner
  private readonly hotReload: BunHotReloadAdapter | undefined
  private readonly jobs = new Map<string, BuildJob>()
  private activePreviewId: string | undefined
  private activeController: AbortController | undefined
  private closed = false

  constructor(options: BunPluginBuilderOptions = {}) {
    this.environment = options.environment ?? process.env
    this.bunBinary = resolve(options.bunBinary ?? defaultBunBinary())
    this.stateRoot = resolve(
      options.stateRoot ?? resolveBunBuilderStateRoot(this.environment),
    )
    this.now = options.now ?? Date.now
    this.processRunner = options.runProcess ?? runProcess
    this.hotReload = options.hotReload
  }

  isStatePath(path: string): boolean {
    if (!isAbsolute(path) || path.includes('\0')) return false
    return isInside(this.stateRoot, resolve(path))
  }

  async status(signal?: AbortSignal): Promise<BunBuilderRuntimeStatus> {
    if (this.closed) return { available: false, busy: false, error: 'builder is closed' }
    try {
      await mkdir(this.stateRoot, { recursive: true, mode: 0o700 })
      await regularFile(this.bunBinary, 'Bun runtime')
      const outcome = await this.processRunner(this.bunBinary, ['--version'], {
        cwd: this.stateRoot,
        environment: await childEnvironment(this.environment, this.bunBinary, join(this.stateRoot, 'cache')),
        timeoutMs: 10_000,
        ...(signal === undefined ? {} : { signal }),
      })
      if (outcome.exitCode !== 0) return { available: false, busy: this.activePreviewId !== undefined, error: 'Bun runtime did not start' }
      const version = outcome.output.trim().split(/\s+/u)[0]
      return {
        available: true,
        busy: this.activePreviewId !== undefined,
        ...(version === undefined || version.length === 0 ? {} : { version }),
      }
    } catch (cause) {
      return { available: false, busy: this.activePreviewId !== undefined, error: boundedMessage(cause) }
    }
  }

  async inspect(input: BunBuildPreviewInput, signal?: AbortSignal): Promise<BunBuildInspection> {
    this.assertOpen()
    signal?.throwIfAborted()
    if (!isAbsolute(input.sourceDirectory) || input.sourceDirectory.includes('\0')) {
      throw new Error('source directory must be an absolute local path')
    }
    const suppliedSource = resolve(input.sourceDirectory)
    const suppliedInfo = await lstat(suppliedSource)
    if (!suppliedInfo.isDirectory() || suppliedInfo.isSymbolicLink()) {
      throw new Error('source directory must be a real directory, not a symbolic link')
    }
    const sourceDirectory = await realpath(suppliedSource)
    if (isInside(sourceDirectory, this.stateRoot) || isInside(this.stateRoot, sourceDirectory)) {
      throw new Error('source directory overlaps the builder state directory')
    }
    const packageSubdirectory = validatePackageSubdirectory(input.packageSubdirectory)
    const sourcePackageRoot = packageSubdirectory.length === 0
      ? sourceDirectory
      : resolve(sourceDirectory, ...packageSubdirectory.split('/'))
    if (!isInside(sourceDirectory, sourcePackageRoot)) {
      throw new Error('package subdirectory escaped the source directory')
    }
    const plan = parsePackagePlan(await readJson(join(sourcePackageRoot, 'package.json')))
    if (plan.bundlePatch !== undefined) {
      await regularFile(join(sourcePackageRoot, plan.bundlePatch), 'dsh.bundle.patch')
    }
    signal?.throwIfAborted()
    const hotUpdate = this.hotReload === undefined
      ? { available: false, reason: 'Cordis HMR is unavailable in this runtime.' }
      : await this.hotReload.inspect(this.hotUpdateTarget(plan, sourcePackageRoot))
    return Object.freeze({
      packageName: plan.packageName,
      hotUpdateAvailable: hotUpdate.available,
      ...(hotUpdate.reason === undefined ? {} : { hotUpdateReason: hotUpdate.reason }),
    })
  }

  async preview(input: BunBuildPreviewInput, signal?: AbortSignal): Promise<BunBuildPreview> {
    this.assertOpen()
    signal?.throwIfAborted()
    if (!isAbsolute(input.sourceDirectory) || input.sourceDirectory.includes('\0')) {
      throw new Error('source directory must be an absolute local path')
    }
    const suppliedSource = resolve(input.sourceDirectory)
    const suppliedInfo = await lstat(suppliedSource)
    if (!suppliedInfo.isDirectory() || suppliedInfo.isSymbolicLink()) {
      throw new Error('source directory must be a real directory, not a symbolic link')
    }
    const sourceDirectory = await realpath(suppliedSource)
    if (isInside(sourceDirectory, this.stateRoot) || isInside(this.stateRoot, sourceDirectory)) {
      throw new Error('source directory overlaps the builder state directory')
    }
    const packageSubdirectory = validatePackageSubdirectory(input.packageSubdirectory)
    const previewId = randomUUID()
    const jobRoot = join(this.stateRoot, 'jobs', previewId)
    const snapshotRoot = join(jobRoot, 'source')
    try {
      await mkdir(jobRoot, { recursive: true, mode: 0o700 })
      await copySourceTree(sourceDirectory, snapshotRoot, { files: 0, bytes: 0 })
      signal?.throwIfAborted()
      const packageRoot = packageSubdirectory.length === 0
        ? snapshotRoot
        : resolve(snapshotRoot, ...packageSubdirectory.split('/'))
      if (!isInside(snapshotRoot, packageRoot)) throw new Error('package subdirectory escaped the source snapshot')
      const plan = parsePackagePlan(await readJson(join(packageRoot, 'package.json')))
      if (plan.bundlePatch !== undefined) {
        await regularFile(join(packageRoot, plan.bundlePatch), 'dsh.bundle.patch')
      }
      if (plan.buildScript === undefined) await this.validatePackageAt(packageRoot, plan)
      const rootManifest = join(snapshotRoot, 'package.json')
      const installRoot = packageRoot !== snapshotRoot && await exists(rootManifest) ? snapshotRoot : packageRoot
      const frozenInstall = await exists(join(installRoot, 'bun.lock')) || await exists(join(installRoot, 'bun.lockb'))
      const sourcePackageRoot = packageSubdirectory.length === 0
        ? sourceDirectory
        : resolve(sourceDirectory, ...packageSubdirectory.split('/'))
      const hotUpdate = this.hotReload === undefined
        ? { available: false, reason: 'Cordis HMR is unavailable in this runtime.' }
        : await this.hotReload.inspect(this.hotUpdateTarget(plan, sourcePackageRoot))
      const expiresAt = new Date(this.now() + PREVIEW_TTL_MS).toISOString()
      const preview: BunBuildPreview = Object.freeze({
        previewId,
        packageName: plan.packageName,
        version: plan.version,
        packageSubdirectory,
        buildScript: plan.buildScript ?? PREBUILT_BUILD_LABEL,
        buildRequired: plan.buildScript !== undefined,
        packageKind: plan.packageKind,
        ...(plan.bundlePatch === undefined ? {} : { bundlePatch: plan.bundlePatch }),
        confirmation: `${plan.packageName}@${plan.version}`,
        frozenInstall,
        hotUpdateAvailable: hotUpdate.available,
        ...(hotUpdate.reason === undefined ? {} : { hotUpdateReason: hotUpdate.reason }),
        warnings: Object.freeze([
          ...(plan.buildScript === undefined
            ? ['No build script is declared; the reviewed prebuilt Host and Client entries will be used.']
            : ['The package build script executes local code with your user permissions.']),
          'Dependency lifecycle scripts are disabled during Bun install and pack.',
          ...(plan.packageKind === 'plugin'
            ? ['This package relies on an external profile or bundle patch to mount it.']
            : []),
          ...(frozenInstall ? [] : ['No Bun lockfile was found; dependency resolution is not reproducible.']),
        ]),
        expiresAt,
      })
      this.jobs.set(previewId, {
        preview,
        jobRoot,
        snapshotRoot,
        packageRoot,
        installRoot,
        sourceRoot: sourceDirectory,
        sourcePackageRoot,
        plan,
        state: 'ready',
      })
      return preview
    } catch (cause) {
      await rm(jobRoot, { recursive: true, force: true })
      throw cause
    }
  }

  async build(input: BunBuildRequest): Promise<BunBuildResult> {
    this.assertOpen()
    const previewId = validatePreviewId(input.previewId)
    const job = this.currentJob(previewId)
    if (input.confirmation !== job.preview.confirmation) throw new Error('build confirmation does not match the preview')
    if (job.state !== 'ready') throw new Error('build preview is no longer executable')
    if (this.activePreviewId !== undefined) throw new Error('another Bun plugin build is already running')
    input.signal?.throwIfAborted()
    const controller = new AbortController()
    const signal = input.signal === undefined
      ? controller.signal
      : AbortSignal.any([input.signal, controller.signal])
    this.activePreviewId = previewId
    this.activeController = controller
    job.state = 'building'
    const logs: { install: string; build: string; pack: string } = { install: '', build: '', pack: '' }
    try {
      await regularFile(this.bunBinary, 'Bun runtime')
      const cacheRoot = join(this.stateRoot, 'cache')
      const artifactRoot = join(this.stateRoot, 'artifacts', previewId)
      await mkdir(cacheRoot, { recursive: true, mode: 0o700 })
      await rm(artifactRoot, { recursive: true, force: true })
      await mkdir(artifactRoot, { recursive: true, mode: 0o700 })
      const environment = await childEnvironment(this.environment, this.bunBinary, cacheRoot)

      const installArgs = ['install', '--ignore-scripts', '--linker', 'isolated']
      if (job.preview.frozenInstall) installArgs.push('--frozen-lockfile')
      const install = await this.processRunner(this.bunBinary, installArgs, {
        cwd: job.installRoot,
        environment,
        timeoutMs: INSTALL_TIMEOUT_MS,
        signal,
      })
      logs.install = install.output
      if (install.exitCode !== 0 || install.timedOut || install.signal !== null) throw stageFailure('install', install)

      if (job.plan.buildScript !== undefined) {
        const build = await this.processRunner(this.bunBinary, ['run', 'build'], {
          cwd: job.packageRoot,
          environment,
          timeoutMs: BUILD_TIMEOUT_MS,
          signal,
        })
        logs.build = build.output
        if (build.exitCode !== 0 || build.timedOut || build.signal !== null) throw stageFailure('build', build)
      }
      await this.validateBuiltPackage(job)

      const inspectPack = await this.processRunner(
        this.bunBinary,
        ['pm', 'pack', '--dry-run', '--ignore-scripts'],
        {
          cwd: job.packageRoot,
          environment,
          timeoutMs: PACK_TIMEOUT_MS,
          signal,
        },
      )
      logs.pack = inspectPack.output
      if (inspectPack.exitCode !== 0 || inspectPack.timedOut || inspectPack.signal !== null) {
        throw stageFailure('pack', inspectPack)
      }
      validatePackFileList(inspectPack.output, job.plan)

      const pack = await this.processRunner(
        this.bunBinary,
        ['pm', 'pack', '--ignore-scripts', '--destination', artifactRoot, '--quiet'],
        {
          cwd: job.packageRoot,
          environment,
          timeoutMs: PACK_TIMEOUT_MS,
          signal,
        },
      )
      logs.pack = appendOutput(logs.pack, pack.output)
      if (pack.exitCode !== 0 || pack.timedOut || pack.signal !== null) throw stageFailure('pack', pack)
      const artifacts = (await readdir(artifactRoot)).filter(name => name.endsWith('.tgz'))
      if (artifacts.length !== 1) throw new Error('Bun pack did not produce exactly one tarball')
      const artifactPath = join(artifactRoot, artifacts[0]!)
      const artifactInfo = await lstat(artifactPath)
      if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink() || artifactInfo.size > MAX_ARTIFACT_BYTES) {
        throw new Error('packed artifact is invalid or too large')
      }
      const artifactSha256 = await hashFile(artifactPath)
      job.state = 'complete'
      return Object.freeze({
        previewId,
        packageName: job.plan.packageName,
        version: job.plan.version,
        packageKind: job.plan.packageKind,
        ...(job.plan.bundlePatch === undefined ? {} : { bundlePatch: job.plan.bundlePatch }),
        artifactPath,
        artifactSha256,
        artifactBytes: artifactInfo.size,
        completedAt: new Date(this.now()).toISOString(),
        logs: Object.freeze({ ...logs }),
      })
    } catch (cause) {
      job.state = 'failed'
      if (isBunBuildFailure(cause)) {
        throw new BunBuildFailure(cause.message, { ...logs, ...cause.logs })
      }
      throw new BunBuildFailure(boundedMessage(cause), logs)
    } finally {
      this.activePreviewId = undefined
      this.activeController = undefined
    }
  }

  /**
   * Install dependencies and build the reviewed source tree itself. Managed
   * App installation uses this before linking that same tree into the active
   * profile, keeping one canonical directory for Vibe Coding and Cordis HMR.
   */
  async buildSource(input: BunBuildRequest): Promise<BunSourceBuildResult> {
    this.assertOpen()
    const previewId = validatePreviewId(input.previewId)
    const job = this.currentJob(previewId)
    if (input.confirmation !== job.preview.confirmation) throw new Error('build confirmation does not match the preview')
    if (job.state !== 'ready') throw new Error('build preview is no longer executable')
    if (this.activePreviewId !== undefined) throw new Error('another Bun plugin build is already running')
    input.signal?.throwIfAborted()
    const controller = new AbortController()
    const signal = input.signal === undefined
      ? controller.signal
      : AbortSignal.any([input.signal, controller.signal])
    this.activePreviewId = previewId
    this.activeController = controller
    job.state = 'building'
    const logs = { install: '', build: '' }
    try {
      await regularFile(this.bunBinary, 'Bun runtime')
      await this.validateLiveSource(job)
      const cacheRoot = join(this.stateRoot, 'cache')
      await mkdir(cacheRoot, { recursive: true, mode: 0o700 })
      const environment = await childEnvironment(this.environment, this.bunBinary, cacheRoot)
      const liveInstallRoot = resolve(job.sourceRoot, relative(job.snapshotRoot, job.installRoot))
      if (!isInside(job.sourceRoot, liveInstallRoot)) throw new Error('install directory escaped the reviewed source')

      const installArgs = ['install', '--ignore-scripts', '--linker', 'isolated']
      if (job.preview.frozenInstall) installArgs.push('--frozen-lockfile')
      const install = await this.processRunner(this.bunBinary, installArgs, {
        cwd: liveInstallRoot,
        environment,
        timeoutMs: INSTALL_TIMEOUT_MS,
        signal,
      })
      logs.install = install.output
      if (install.exitCode !== 0 || install.timedOut || install.signal !== null) throw stageFailure('install', install)

      if (job.plan.buildScript !== undefined) {
        const build = await this.processRunner(this.bunBinary, ['run', 'build'], {
          cwd: job.sourcePackageRoot,
          environment,
          timeoutMs: BUILD_TIMEOUT_MS,
          signal,
        })
        logs.build = build.output
        if (build.exitCode !== 0 || build.timedOut || build.signal !== null) throw stageFailure('build', build)
      }
      await this.validatePackageAt(job.sourcePackageRoot, job.plan)
      job.state = 'complete'
      return Object.freeze({
        previewId,
        packageName: job.plan.packageName,
        version: job.plan.version,
        packageKind: job.plan.packageKind,
        ...(job.plan.bundlePatch === undefined ? {} : { bundlePatch: job.plan.bundlePatch }),
        sourcePackageRoot: job.sourcePackageRoot,
        completedAt: new Date(this.now()).toISOString(),
        logs: Object.freeze({ ...logs }),
      })
    } catch (cause) {
      job.state = 'failed'
      const completeLogs: BunBuildLogs = { ...logs, pack: '' }
      if (isBunBuildFailure(cause)) {
        throw new BunBuildFailure(cause.message, { ...completeLogs, ...cause.logs })
      }
      throw new BunBuildFailure(boundedMessage(cause), completeLogs)
    } finally {
      this.activePreviewId = undefined
      this.activeController = undefined
    }
  }

  async hotUpdate(input: BunBuildRequest): Promise<BunHotUpdateResult> {
    this.assertOpen()
    const previewId = validatePreviewId(input.previewId)
    const job = this.currentJob(previewId)
    if (input.confirmation !== job.preview.confirmation) throw new Error('build confirmation does not match the preview')
    if (job.state !== 'ready') throw new Error('build preview is no longer executable')
    if (!job.preview.hotUpdateAvailable || this.hotReload === undefined) {
      throw new Error(job.preview.hotUpdateReason ?? 'the selected source is not the active plugin')
    }
    if (this.activePreviewId !== undefined) throw new Error('another Bun plugin build is already running')
    input.signal?.throwIfAborted()
    const controller = new AbortController()
    const signal = input.signal === undefined
      ? controller.signal
      : AbortSignal.any([input.signal, controller.signal])
    this.activePreviewId = previewId
    this.activeController = controller
    job.state = 'building'
    let buildLog = ''
    try {
      await regularFile(this.bunBinary, 'Bun runtime')
      await this.validateLiveSource(job)
      const target = this.hotUpdateTarget(job.plan, job.sourcePackageRoot)
      const availability = await this.hotReload.inspect(target)
      if (!availability.available) throw new Error(availability.reason ?? 'the selected source is not the active plugin')

      const cacheRoot = join(this.stateRoot, 'cache')
      await mkdir(cacheRoot, { recursive: true, mode: 0o700 })
      const environment = await childEnvironment(this.environment, this.bunBinary, cacheRoot)
      if (job.plan.buildScript !== undefined) {
        const build = await this.processRunner(this.bunBinary, ['run', 'build'], {
          cwd: job.sourcePackageRoot,
          environment,
          timeoutMs: BUILD_TIMEOUT_MS,
          signal,
        })
        buildLog = build.output
        if (build.exitCode !== 0 || build.timedOut || build.signal !== null) throw stageFailure('build', build)
      }
      await this.validatePackageAt(job.sourcePackageRoot, job.plan)
      await this.hotReload.reload(target)
      job.state = 'complete'
      return Object.freeze({
        previewId,
        packageName: job.plan.packageName,
        version: job.plan.version,
        sourcePackageRoot: job.sourcePackageRoot,
        completedAt: new Date(this.now()).toISOString(),
        hostReloaded: true,
        buildLog,
      })
    } catch (cause) {
      job.state = 'failed'
      if (isBunBuildFailure(cause)) {
        throw new BunBuildFailure(cause.message, { install: '', build: buildLog, pack: '', ...cause.logs })
      }
      throw new BunBuildFailure(boundedMessage(cause), { install: '', build: buildLog, pack: '' })
    } finally {
      this.activePreviewId = undefined
      this.activeController = undefined
    }
  }

  async discard(previewId: string): Promise<void> {
    this.assertOpen()
    const id = validatePreviewId(previewId)
    if (this.activePreviewId === id) throw new Error('cannot discard a running build')
    const job = this.jobs.get(id)
    if (job === undefined) throw new Error('build preview is unavailable or expired')
    this.jobs.delete(id)
    await rm(job.jobRoot, { recursive: true, force: true })
    if (job.state !== 'complete') {
      await rm(join(this.stateRoot, 'artifacts', id), { recursive: true, force: true })
    }
  }

  close(): void {
    this.closed = true
    this.activeController?.abort()
    for (const [previewId, job] of this.jobs) {
      if (job.state === 'building') continue
      this.jobs.delete(previewId)
      void rm(job.jobRoot, { recursive: true, force: true })
      if (job.state !== 'complete') {
        void rm(join(this.stateRoot, 'artifacts', previewId), { recursive: true, force: true })
      }
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('builder is closed')
  }

  private currentJob(previewId: string): BuildJob {
    const job = this.jobs.get(previewId)
    if (job === undefined) throw new Error('build preview is unavailable or expired')
    if (Date.parse(job.preview.expiresAt) <= this.now()) {
      this.jobs.delete(previewId)
      void rm(job.jobRoot, { recursive: true, force: true })
      throw new Error('build preview expired')
    }
    return job
  }

  private async validateBuiltPackage(job: BuildJob): Promise<void> {
    await this.validatePackageAt(job.packageRoot, job.plan)
  }

  private async validatePackageAt(packageRoot: string, plan: PackagePlan): Promise<void> {
    const current = parsePackagePlan(await readJson(join(packageRoot, 'package.json')))
    if (
      current.packageName !== plan.packageName
      || current.version !== plan.version
      || current.packageKind !== plan.packageKind
      || current.bundlePatch !== plan.bundlePatch
      || current.hostEntry !== plan.hostEntry
      || current.clientEntry !== plan.clientEntry
    ) throw new Error('build changed the reviewed package identity or entry points')
    if (current.bundlePatch !== undefined) {
      await regularFile(join(packageRoot, current.bundlePatch), 'built dsh.bundle.patch')
    }
    await regularFile(join(packageRoot, current.hostEntry), 'built Host entry')
    if (current.clientEntry !== undefined) {
      await regularFile(join(packageRoot, current.clientEntry), 'built Client entry')
    }
  }

  private async validateLiveSource(job: BuildJob): Promise<void> {
    if (await realpath(job.sourceRoot) !== job.sourceRoot) throw new Error('source directory changed after preview')
    if (await realpath(job.sourcePackageRoot) !== job.sourcePackageRoot) throw new Error('package directory changed after preview')
    const current = parsePackagePlan(await readJson(join(job.sourcePackageRoot, 'package.json')))
    if (
      current.packageName !== job.plan.packageName
      || current.version !== job.plan.version
      || current.packageKind !== job.plan.packageKind
      || current.bundlePatch !== job.plan.bundlePatch
      || current.hostEntry !== job.plan.hostEntry
      || current.clientEntry !== job.plan.clientEntry
      || current.buildScript !== job.plan.buildScript
    ) throw new Error('source package changed the reviewed build plan')
  }

  private hotUpdateTarget(plan: PackagePlan, sourcePackageRoot: string): BunHotUpdateTarget {
    return Object.freeze({
      packageName: plan.packageName,
      sourcePackageRoot,
      hostEntryPath: join(sourcePackageRoot, plan.hostEntry),
      ...(plan.clientEntry === undefined ? {} : { clientEntryPath: join(sourcePackageRoot, plan.clientEntry) }),
    })
  }
}
