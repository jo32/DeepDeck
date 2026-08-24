import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { unzip } from 'fflate'
import type {
  AppInstallPreview,
  AppInstallResult,
  AppInstallSourceKind,
  AppUninstallResult,
  AppUpdateContext,
} from './contracts.js'

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 256 * 1024 * 1024
const MAX_EXTRACTED_FILES = 20_000
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024
const MAX_SOURCE_LENGTH = 4096
const PREVIEW_TTL_MS = 30 * 60 * 1000
const GIT_TIMEOUT_MS = 10 * 60 * 1000
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u

export const APP_PLUGIN_DIRECTORY = join('DeepDeck', 'Plugins')

interface AppBuilderPreview {
  readonly previewId: string
  readonly packageName: string
  readonly version: string
  readonly packageKind: 'plugin' | 'bundle'
  readonly confirmation: string
  readonly buildScript: string
  readonly frozenInstall: boolean
  readonly warnings: readonly string[]
}

interface AppBuilderSourceResult {
  readonly packageName: string
  readonly version: string
  readonly sourcePackageRoot: string
  readonly logs: { readonly install: string; readonly build: string }
}

export interface AppInstallerBuilder {
  preview(input: { readonly sourceDirectory: string }, signal?: AbortSignal): Promise<AppBuilderPreview>
  buildSource(input: {
    readonly previewId: string
    readonly confirmation: string
    readonly signal?: AbortSignal
  }): Promise<AppBuilderSourceResult>
  discard(previewId: string): Promise<void>
}

export interface AppInstallerProfile {
  readonly name: string
  readonly dir: string
}

export interface AppInstallerPnpmOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

export interface AppInstallerPnpmHandle {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<AppInstallerPnpmOutcome>
  cancel(): void
}

export interface AppInstallerPnpm {
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): AppInstallerPnpmHandle
  runPluginInstall(
    args: readonly string[],
    invokingDir: string,
    recovery: {
      readonly packageName: string
      readonly packageVersion: string
      readonly receiptId: string
    },
    signal?: AbortSignal,
  ): Promise<AppInstallerPnpmHandle>
  rollbackPluginInstall(receiptId: string): Promise<boolean>
}

interface AppManifestIdentity {
  readonly appId: string
  readonly title: string
}

interface ManagedPreview {
  readonly public: AppInstallPreview
  readonly builder: AppBuilderPreview
  readonly stagingRoot?: string
  readonly sourceRoot: string
  readonly finalDirectory: string
  readonly existingManagedDirectory: boolean
  readonly source: string
}

interface AppSourceReceipt {
  readonly schemaVersion: 1
  readonly appId: string
  readonly packageName: string
  readonly sourceKind: AppInstallSourceKind
  readonly source: string
  readonly sourceDirectory: string
  readonly installedAt: string
}

interface ProcessOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly output: string
  readonly timedOut: boolean
}

type GitRunner = (
  args: readonly string[],
  options: { readonly cwd: string; readonly signal?: AbortSignal },
) => Promise<ProcessOutcome>

export interface AppPackageManagerOptions {
  readonly builder: AppInstallerBuilder
  readonly profile: AppInstallerProfile
  readonly pnpm: AppInstallerPnpm
  readonly requestRestart: () => Promise<void>
  readonly homeDirectory?: string
  readonly fetchValue?: typeof fetch
  readonly runGit?: GitRunner
  readonly now?: () => number
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isInside(parent: string, candidate: string): boolean {
  const fromParent = relative(parent, candidate)
  return fromParent === '' || (!fromParent.startsWith('..') && !isAbsolute(fromParent))
}

function isImmediateChild(parent: string, candidate: string): boolean {
  const fromParent = relative(parent, candidate)
  return fromParent.length > 0
    && !fromParent.startsWith('..')
    && !isAbsolute(fromParent)
    && !fromParent.includes('/')
    && !fromParent.includes('\\')
}

function appendOutput(current: string, chunk: Buffer | string): string {
  if (current.length >= MAX_PROCESS_OUTPUT_BYTES) return current
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
  return current + text.slice(0, MAX_PROCESS_OUTPUT_BYTES - current.length)
}

const defaultGitRunner: GitRunner = async (args, options) => await new Promise((resolveRun, rejectRun) => {
  let output = ''
  let timedOut = false
  let settled = false
  let forceStop: ReturnType<typeof setTimeout> | undefined
  const child = spawn('git', [...args], {
    cwd: options.cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const stop = (): void => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    forceStop ??= setTimeout(() => child.kill('SIGKILL'), 2_000)
  }
  const abort = (): void => stop()
  const timer = setTimeout(() => {
    timedOut = true
    stop()
  }, GIT_TIMEOUT_MS)
  const finish = (callback: () => void): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (forceStop !== undefined) clearTimeout(forceStop)
    options.signal?.removeEventListener('abort', abort)
    callback()
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted === true) abort()
  child.stdout?.on('data', chunk => { output = appendOutput(output, chunk as Buffer) })
  child.stderr?.on('data', chunk => { output = appendOutput(output, chunk as Buffer) })
  child.once('error', cause => finish(() => rejectRun(cause)))
  child.once('close', (exitCode, signal) => finish(() => resolveRun({ exitCode, signal, output, timedOut })))
})

function validatedSource(value: string): string {
  const source = value.trim()
  if (source.length === 0 || source.length > MAX_SOURCE_LENGTH || source.includes('\0')) {
    throw new Error('安装地址无效。')
  }
  return source
}

function parsedOnlineUrl(source: string): URL | undefined {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('线上安装地址只支持 HTTP 或 HTTPS。')
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('线上安装地址不能包含用户名或密码。')
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error('线上安装地址不能包含查询参数或片段；请使用不会把临时凭据写入更新记录的固定地址。')
  }
  return url
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08))
}

async function readBoundedFile(path: string): Promise<Uint8Array> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('本地安装地址必须是目录或普通 ZIP 文件。')
  if (info.size > MAX_ARCHIVE_BYTES) throw new Error('ZIP 文件超过 128 MiB 限制。')
  return await readFile(path)
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) {
    throw new Error('线上文件超过 128 MiB 限制。')
  }
  if (response.body === null) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_ARCHIVE_BYTES) {
      await reader.cancel()
      throw new Error('线上文件超过 128 MiB 限制。')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function download(source: URL, fetchValue: typeof fetch, signal?: AbortSignal): Promise<Uint8Array | undefined> {
  let current = source
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetchValue(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.1' },
      ...(signal === undefined ? {} : { signal }),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location === null || redirects === 5) throw new Error('线上安装地址重定向无效或过多。')
      current = new URL(location, current)
      if ((current.protocol !== 'https:' && current.protocol !== 'http:')
        || current.username.length > 0 || current.password.length > 0) {
        throw new Error('线上安装地址重定向到了不支持的位置。')
      }
      continue
    }
    if (!response.ok) return undefined
    const bytes = await responseBytes(response)
    return isZip(bytes) ? bytes : undefined
  }
  return undefined
}

function normalizedArchivePath(name: string): string {
  let value = name
  while (value.startsWith('./')) value = value.slice(2)
  if (
    value.length === 0
    || value.includes('\\')
    || value.includes('\0')
    || value.startsWith('/')
    || /^[A-Za-z]:/u.test(value)
    || /[\u0000-\u001F\u007F]/u.test(value)
  ) throw new Error(`ZIP 包含不安全路径：${name}`)
  const segments = value.replace(/\/$/u, '').split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`ZIP 包含不安全路径：${name}`)
  }
  return segments.join('/')
}

async function extractZip(bytes: Uint8Array, destination: string): Promise<void> {
  let files = 0
  let extractedBytes = 0
  const normalized = new Map<string, string>()
  const contents = await new Promise<Record<string, Uint8Array>>((resolveUnzip, rejectUnzip) => {
    try {
      unzip(bytes, {
        filter(file) {
          const path = normalizedArchivePath(file.name)
          if (normalized.has(path)) throw new Error(`ZIP 包含重复路径：${path}`)
          normalized.set(path, file.name)
          if (file.name.endsWith('/')) return false
          files += 1
          extractedBytes += file.originalSize
          if (files > MAX_EXTRACTED_FILES || extractedBytes > MAX_EXTRACTED_BYTES) {
            throw new Error('ZIP 解压后超过 20,000 个文件或 256 MiB 限制。')
          }
          return true
        },
      }, (cause, value) => {
        if (cause !== null) rejectUnzip(cause)
        else resolveUnzip(value)
      })
    } catch (cause) {
      rejectUnzip(cause)
    }
  })
  await mkdir(destination, { recursive: true, mode: 0o700 })
  for (const [name, data] of Object.entries(contents).sort(([left], [right]) => left.localeCompare(right))) {
    const path = normalizedArchivePath(name)
    const target = resolve(destination, ...path.split('/'))
    if (!isInside(destination, target)) throw new Error(`ZIP 路径越界：${name}`)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await writeFile(target, data, { mode: 0o600 })
  }
}

async function locateRepositoryRoot(source: string): Promise<string> {
  let current = source
  for (let depth = 0; depth < 4; depth += 1) {
    if (await exists(join(current, 'package.json'))) return await realpath(current)
    const entries = (await readdir(current, { withFileTypes: true }))
      .filter(entry => entry.name !== '__MACOSX' && entry.name !== '.DS_Store')
    if (entries.length !== 1 || entries[0]?.isDirectory() !== true) break
    current = join(current, entries[0].name)
  }
  throw new Error('没有在安装源根目录中找到插件仓库 package.json。')
}

async function readAppIdentity(sourceRoot: string): Promise<AppManifestIdentity> {
  const bytes = await readFile(join(sourceRoot, 'package.json'))
  if (bytes.byteLength > 1024 * 1024) throw new Error('插件 package.json 过大。')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!isObject(value) || !isObject(value.dsh) || !isObject(value.dsh.app)) {
    throw new Error('该插件没有声明 dsh.app，不能从 Apps 安装。')
  }
  const appId = value.dsh.app.id
  const title = value.dsh.app.title
  if (typeof appId !== 'string' || !APP_ID_PATTERN.test(appId)) throw new Error('插件 dsh.app.id 无效。')
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > 120) {
    throw new Error('插件 dsh.app.title 无效。')
  }
  return { appId, title: title.trim() }
}

async function copyLocalRepository(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter(path) {
      const fromSource = relative(source, path)
      if (fromSource.length === 0) return true
      return fromSource.split(/[\\/]/u)[0] !== 'node_modules'
    },
  })
}

async function collectOutput(stream: Readable): Promise<string> {
  let output = ''
  for await (const chunk of stream) output = appendOutput(output, chunk as Buffer | string)
  return output
}

async function runPnpmHandle(handle: AppInstallerPnpmHandle, signal?: AbortSignal): Promise<string> {
  const cancel = (): void => handle.cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const [outcome, stdout, stderr] = await Promise.all([
      handle.done,
      collectOutput(handle.stdout),
      collectOutput(handle.stderr),
    ])
    signal?.throwIfAborted()
    if (outcome.exitCode !== 0 || outcome.signal !== null) {
      const details = appendOutput(stdout, stderr).trim()
      throw new Error(`插件包操作失败${details.length === 0 ? '' : `：${details}`}`)
    }
    return appendOutput(stdout, stderr)
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

async function profileManifest(profile: AppInstallerProfile): Promise<JsonObject> {
  if (!isAbsolute(profile.dir) || profile.dir.includes('\0')) throw new Error('当前插件 profile 无效。')
  const value: unknown = JSON.parse(await readFile(join(profile.dir, 'package.json'), 'utf8'))
  if (!isObject(value)) throw new Error('当前插件 profile manifest 无效。')
  return value
}

function profileDependencies(manifest: JsonObject): JsonObject {
  return isObject(manifest.dependencies) ? manifest.dependencies : {}
}

function profileBundles(manifest: JsonObject): readonly unknown[] {
  return isObject(manifest.dsh) && isObject(manifest.dsh.profile) && Array.isArray(manifest.dsh.profile.bundles)
    ? manifest.dsh.profile.bundles
    : []
}

function profilePackageState(
  manifest: JsonObject,
  packageName: string,
): { readonly dependency: boolean; readonly bundled: boolean } {
  return {
    dependency: Object.hasOwn(profileDependencies(manifest), packageName),
    bundled: profileBundles(manifest).includes(packageName),
  }
}

/** Host-only App source acquisition, build, profile link, and removal boundary. */
export class DeepDeckAppPackageManager {
  private readonly builder: AppInstallerBuilder
  private readonly profile: AppInstallerProfile
  private readonly pnpm: AppInstallerPnpm
  private readonly restartAction: () => Promise<void>
  private readonly fetchValue: typeof fetch
  private readonly runGit: GitRunner
  private readonly now: () => number
  private readonly pluginRoot: string
  private readonly previews = new Map<string, ManagedPreview>()
  private operationActive = false

  constructor(options: AppPackageManagerOptions) {
    this.builder = options.builder
    this.profile = options.profile
    this.pnpm = options.pnpm
    this.restartAction = options.requestRestart
    this.fetchValue = options.fetchValue ?? fetch
    this.runGit = options.runGit ?? defaultGitRunner
    this.now = options.now ?? Date.now
    this.pluginRoot = resolve(options.homeDirectory ?? homedir(), APP_PLUGIN_DIRECTORY)
  }

  async preview(sourceValue: string, signal?: AbortSignal): Promise<AppInstallPreview> {
    return await this.runExclusive(async () => {
      await this.purgeExpired()
      signal?.throwIfAborted()
      const source = validatedSource(sourceValue)
      const previewId = randomUUID()
      const stagingRoot = join(this.pluginRoot, '.staging', previewId)
      let sourceRoot: string
      let sourceKind: AppInstallSourceKind
      let ownedStaging = true
      let builderPreview: AppBuilderPreview | undefined
      try {
        const online = parsedOnlineUrl(source)
        if (online !== undefined) {
          await mkdir(stagingRoot, { recursive: true, mode: 0o700 })
          const archive = online.pathname.endsWith('.git')
            ? undefined
            : await download(online, this.fetchValue, signal)
          if (archive !== undefined) {
            sourceKind = 'remote-zip'
            const extracted = join(stagingRoot, 'archive')
            await extractZip(archive, extracted)
            sourceRoot = await locateRepositoryRoot(extracted)
          } else {
            sourceKind = 'git-repository'
            const cloned = join(stagingRoot, 'repository')
            const outcome = await this.runGit(
              ['clone', '--depth=1', '--no-tags', '--single-branch', '--', online.href, cloned],
              { cwd: stagingRoot, ...(signal === undefined ? {} : { signal }) },
            )
            signal?.throwIfAborted()
            if (outcome.exitCode !== 0 || outcome.signal !== null || outcome.timedOut) {
              throw new Error(`无法 clone 插件仓库：${outcome.output.trim() || 'git clone failed'}`)
            }
            sourceRoot = await locateRepositoryRoot(cloned)
          }
        } else {
          if (!isAbsolute(source)) throw new Error('本地安装地址必须是绝对路径。')
          const local = resolve(source)
          const info = await lstat(local)
          if (info.isDirectory() && !info.isSymbolicLink()) {
            const canonical = await realpath(local)
            const canonicalPluginRoot = await realpath(this.pluginRoot).catch(() => this.pluginRoot)
            if (isImmediateChild(canonicalPluginRoot, canonical) && basename(canonical) !== '.staging') {
              sourceKind = 'local-directory'
              sourceRoot = await locateRepositoryRoot(canonical)
              ownedStaging = false
            } else {
              sourceKind = 'local-directory'
              await mkdir(stagingRoot, { recursive: true, mode: 0o700 })
              const copied = join(stagingRoot, 'repository')
              if (await exists(join(canonical, '.git'))) {
                const outcome = await this.runGit(
                  ['clone', '--no-hardlinks', '--', canonical, copied],
                  { cwd: stagingRoot, ...(signal === undefined ? {} : { signal }) },
                )
                signal?.throwIfAborted()
                if (outcome.exitCode !== 0 || outcome.signal !== null || outcome.timedOut) {
                  throw new Error(`无法复制本地插件仓库：${outcome.output.trim() || 'git clone failed'}`)
                }
              } else {
                await copyLocalRepository(canonical, copied)
              }
              sourceRoot = await locateRepositoryRoot(copied)
            }
          } else {
            sourceKind = 'local-zip'
            const bytes = await readBoundedFile(local)
            if (!isZip(bytes)) throw new Error('本地文件不是 ZIP 包。')
            await mkdir(stagingRoot, { recursive: true, mode: 0o700 })
            const extracted = join(stagingRoot, 'archive')
            await extractZip(bytes, extracted)
            sourceRoot = await locateRepositoryRoot(extracted)
          }
        }

        const identity = await readAppIdentity(sourceRoot)
        const builder = await this.builder.preview({ sourceDirectory: sourceRoot }, signal)
        builderPreview = builder
        if (builder.packageKind !== 'bundle') throw new Error('该 App 插件没有声明可安装的 dsh.bundle。')
        if (!PACKAGE_NAME_PATTERN.test(builder.packageName)) throw new Error('插件包名无效。')
        const manifest = await profileManifest(this.profile)
        const profileState = profilePackageState(manifest, builder.packageName)
        if (profileState.bundled) throw new Error(`当前 profile 已加载 ${builder.packageName}。`)
        const finalDirectory = ownedStaging ? join(this.pluginRoot, identity.appId) : sourceRoot
        if (ownedStaging && await exists(finalDirectory)) {
          throw new Error(`插件目录已存在：${finalDirectory}。可直接输入该目录重新安装。`)
        }
        const publicPreview: AppInstallPreview = Object.freeze({
          previewId,
          appId: identity.appId,
          title: identity.title,
          packageName: builder.packageName,
          version: builder.version,
          sourceKind,
          profileAction: profileState.dependency ? 'repair' : 'install',
          sourceDirectory: finalDirectory,
          buildScript: builder.buildScript,
          frozenInstall: builder.frozenInstall,
          warnings: builder.warnings,
          expiresAt: new Date(this.now() + PREVIEW_TTL_MS).toISOString(),
        })
        this.previews.set(previewId, {
          public: publicPreview,
          builder,
          ...(ownedStaging ? { stagingRoot } : {}),
          sourceRoot,
          finalDirectory,
          existingManagedDirectory: !ownedStaging,
          source,
        })
        return publicPreview
      } catch (cause) {
        if (builderPreview !== undefined) await this.builder.discard(builderPreview.previewId).catch(() => {})
        if (ownedStaging) await rm(stagingRoot, { recursive: true, force: true })
        throw cause
      }
    })
  }

  async install(previewId: string, signal?: AbortSignal): Promise<AppInstallResult> {
    return await this.runExclusive(async () => {
      await this.purgeExpired()
      const preview = this.currentPreview(previewId)
      signal?.throwIfAborted()
      const current = await profileManifest(this.profile)
      const currentState = profilePackageState(current, preview.builder.packageName)
      if (currentState.bundled) throw new Error(`当前 profile 已加载 ${preview.builder.packageName}。`)
      if (preview.public.profileAction === 'install' && currentState.dependency) {
        throw new Error('profile 在预览后出现了同名依赖，请重新探测以执行修复安装。')
      }
      let moved = false
      let recoveryId: string | undefined
      try {
        const build = await this.builder.buildSource({
          previewId: preview.builder.previewId,
          confirmation: preview.builder.confirmation,
          ...(signal === undefined ? {} : { signal }),
        })
        if (build.packageName !== preview.builder.packageName || build.version !== preview.builder.version) {
          throw new Error('构建结果与审核过的插件身份不一致。')
        }
        if (!preview.existingManagedDirectory) {
          await mkdir(this.pluginRoot, { recursive: true, mode: 0o700 })
          if (await exists(preview.finalDirectory)) throw new Error(`插件目录已存在：${preview.finalDirectory}`)
          await rename(preview.sourceRoot, preview.finalDirectory)
          moved = true
        }
        recoveryId = randomUUID()
        const handle = await this.pnpm.runPluginInstall(
          ['add', '--save-exact', `link:${preview.finalDirectory}`],
          this.profile.dir,
          {
            packageName: preview.builder.packageName,
            packageVersion: preview.builder.version,
            receiptId: recoveryId,
          },
          signal,
        )
        const packageLog = await runPnpmHandle(handle, signal)
        const installed = await profileManifest(this.profile)
        if (!Object.hasOwn(profileDependencies(installed), preview.builder.packageName)
          || !profileBundles(installed).includes(preview.builder.packageName)) {
          throw new Error('包管理器已结束，但插件没有加入当前 profile。')
        }
        await this.writeSourceReceipt({
          schemaVersion: 1,
          appId: preview.public.appId,
          packageName: preview.builder.packageName,
          sourceKind: preview.public.sourceKind,
          source: preview.source,
          sourceDirectory: preview.finalDirectory,
          installedAt: new Date(this.now()).toISOString(),
        })
        this.previews.delete(previewId)
        await this.builder.discard(preview.builder.previewId).catch(() => {})
        if (preview.stagingRoot !== undefined) await rm(preview.stagingRoot, { recursive: true, force: true })
        return Object.freeze({
          appId: preview.public.appId,
          title: preview.public.title,
          packageName: preview.builder.packageName,
          version: preview.builder.version,
          sourceDirectory: preview.finalDirectory,
          profileAction: preview.public.profileAction,
          completedAt: new Date(this.now()).toISOString(),
          installLog: build.logs.install,
          buildLog: build.logs.build,
          packageLog,
          restartRequired: true,
        })
      } catch (cause) {
        if (recoveryId !== undefined) await this.pnpm.rollbackPluginInstall(recoveryId).catch(() => {})
        if (moved && preview.stagingRoot !== undefined) {
          await mkdir(dirname(preview.sourceRoot), { recursive: true, mode: 0o700 })
          await rename(preview.finalDirectory, preview.sourceRoot).catch(() => {})
        }
        this.previews.delete(previewId)
        await this.builder.discard(preview.builder.previewId).catch(() => {})
        if (preview.stagingRoot !== undefined) {
          await rm(preview.stagingRoot, { recursive: true, force: true })
        }
        throw cause
      }
    })
  }

  async discard(previewId: string): Promise<void> {
    const preview = this.previews.get(previewId)
    if (preview === undefined) return
    this.previews.delete(previewId)
    await this.builder.discard(preview.builder.previewId).catch(() => {})
    if (preview.stagingRoot !== undefined) await rm(preview.stagingRoot, { recursive: true, force: true })
  }

  async uninstallAvailability(packageName: string): Promise<{ readonly available: boolean; readonly reason?: string }> {
    if (!PACKAGE_NAME_PATTERN.test(packageName)) return { available: false, reason: '插件包名无效。' }
    try {
      const manifest = await profileManifest(this.profile)
      return Object.hasOwn(profileDependencies(manifest), packageName)
        ? { available: true }
        : { available: false, reason: '该 App 不是当前 profile 中可卸载的依赖。' }
    } catch (cause) {
      return { available: false, reason: errorMessage(cause) }
    }
  }

  async updateAvailability(
    appId: string,
    packageName: string,
    sourceDirectory: string,
  ): Promise<{ readonly available: boolean; readonly reason?: string }> {
    try {
      await this.updateSource(appId, packageName, sourceDirectory)
      return { available: true }
    } catch (cause) {
      return { available: false, reason: errorMessage(cause) }
    }
  }

  async updateSource(
    appId: string,
    packageName: string,
    sourceDirectory: string,
  ): Promise<Pick<AppUpdateContext, 'sourceDirectory' | 'sourceKind' | 'source'>> {
    if (!APP_ID_PATTERN.test(appId)) throw new Error('App ID 无效。')
    if (!PACKAGE_NAME_PATTERN.test(packageName)) throw new Error('插件包名无效。')
    const canonicalSource = await realpath(sourceDirectory)
      .catch(() => { throw new Error('插件源码目录不存在。') })
    if (!await exists(join(canonicalSource, 'package.json'))) throw new Error('插件源码目录缺少 package.json。')

    const receipt = await this.readSourceReceipt(appId)
    if (receipt !== undefined) {
      const recordedDirectory = await realpath(receipt.sourceDirectory).catch(() => resolve(receipt.sourceDirectory))
      if (receipt.packageName !== packageName || recordedDirectory !== canonicalSource) {
        throw new Error('插件安装来源记录与当前 App 不匹配。')
      }
      if (receipt.sourceKind === 'local-directory' || receipt.sourceKind === 'local-zip') {
        const sourceInfo = await lstat(receipt.source).catch(() => undefined)
        const expectedKind = receipt.sourceKind === 'local-directory'
          ? sourceInfo?.isDirectory() === true
          : sourceInfo?.isFile() === true
        if (!expectedKind || sourceInfo?.isSymbolicLink() === true) {
          throw new Error('记录的本地更新源不存在或类型已经改变。')
        }
      }
      const recordedSource = parsedOnlineUrl(receipt.source) === undefined && isAbsolute(receipt.source)
        ? await realpath(receipt.source).catch(() => resolve(receipt.source))
        : undefined
      if (receipt.sourceKind === 'local-directory'
        && recordedSource === canonicalSource) {
        if (await exists(join(canonicalSource, '.git'))) {
          return { sourceDirectory: canonicalSource, sourceKind: 'git-repository' }
        }
        throw new Error('该本地安装源就是当前源码目录，且没有 Git 信息可用于比较更新。')
      }
      return {
        sourceDirectory: canonicalSource,
        sourceKind: receipt.sourceKind,
        source: receipt.source,
      }
    }

    if (await exists(join(canonicalSource, '.git'))) {
      return { sourceDirectory: canonicalSource, sourceKind: 'git-repository' }
    }
    throw new Error('没有找到安装来源记录或 Git remote，无法派发可靠的更新任务。')
  }

  async uninstall(packageName: string, sourceDirectory: string, signal?: AbortSignal): Promise<AppUninstallResult> {
    return await this.runExclusive(async () => {
      const availability = await this.uninstallAvailability(packageName)
      if (!availability.available) throw new Error(availability.reason ?? '该 App 无法卸载。')
      const handle = this.pnpm.runPlugin(['remove', packageName], this.profile.dir, signal)
      const packageLog = await runPnpmHandle(handle, signal)
      const manifest = await profileManifest(this.profile)
      if (Object.hasOwn(profileDependencies(manifest), packageName) || profileBundles(manifest).includes(packageName)) {
        throw new Error('包管理器已结束，但插件仍在当前 profile 中。')
      }
      const canonicalSource = await realpath(sourceDirectory).catch(() => resolve(sourceDirectory))
      return Object.freeze({
        packageName,
        sourceDirectory: canonicalSource,
        sourceRetained: true,
        packageLog,
        completedAt: new Date(this.now()).toISOString(),
        restartRequired: true,
      })
    })
  }

  async requestRestart(): Promise<void> {
    await this.restartAction()
  }

  async close(): Promise<void> {
    await Promise.all([...this.previews].map(async ([previewId]) => await this.discard(previewId)))
  }

  private currentPreview(previewId: string): ManagedPreview {
    const preview = this.previews.get(previewId)
    if (preview === undefined) throw new Error('安装预览不存在或已经过期。')
    if (Date.parse(preview.public.expiresAt) <= this.now()) {
      void this.discard(previewId)
      throw new Error('安装预览已经过期，请重新探测。')
    }
    return preview
  }

  private async purgeExpired(): Promise<void> {
    for (const [previewId, preview] of this.previews) {
      if (Date.parse(preview.public.expiresAt) <= this.now()) await this.discard(previewId)
    }
  }

  private sourceReceiptPath(appId: string): string {
    return join(this.pluginRoot, '.deepdeck', 'sources', `${appId}.json`)
  }

  private async readSourceReceipt(appId: string): Promise<AppSourceReceipt | undefined> {
    let value: unknown
    try {
      value = JSON.parse(await readFile(this.sourceReceiptPath(appId), 'utf8'))
    } catch (cause) {
      const code = isObject(cause) && typeof cause.code === 'string' ? cause.code : undefined
      if (code === 'ENOENT') return undefined
      throw cause
    }
    if (!isObject(value)
      || value.schemaVersion !== 1
      || value.appId !== appId
      || typeof value.packageName !== 'string'
      || typeof value.source !== 'string'
      || typeof value.sourceDirectory !== 'string'
      || typeof value.installedAt !== 'string'
      || !['git-repository', 'remote-zip', 'local-zip', 'local-directory'].includes(String(value.sourceKind))) {
      throw new Error('插件安装来源记录无效。')
    }
    return value as unknown as AppSourceReceipt
  }

  private async writeSourceReceipt(receipt: AppSourceReceipt): Promise<void> {
    const directory = dirname(this.sourceReceiptPath(receipt.appId))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = join(directory, `${receipt.appId}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, this.sourceReceiptPath(receipt.appId))
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }

  private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    if (this.operationActive) throw new Error('另一个 App 安装或卸载操作正在进行。')
    this.operationActive = true
    try {
      return await task()
    } finally {
      this.operationActive = false
    }
  }
}
