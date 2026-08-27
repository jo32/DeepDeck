import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
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
  AppCreateResult,
  AppInstallPreview,
  AppInstallPluginKind,
  AppInstallResult,
  AppInstallSourceKind,
  AppUninstallResult,
  AppUpdateContext,
} from './contracts.js'
import { scaffoldAppSource, type AppScaffoldInput } from './app-scaffolder.js'

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
  readonly buildRequired?: boolean
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
  preview(input: {
    readonly sourceDirectory: string
    readonly packageSubdirectory?: string
  }, signal?: AbortSignal): Promise<AppBuilderPreview>
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
  acknowledgeRecoveredInstall(receiptId: string): Promise<void>
}

interface AppManifestIdentity {
  readonly appId: string
  readonly title: string
  readonly pluginKind: AppInstallPluginKind
  readonly packageName: string
}

export interface AppInstallSourceInput {
  readonly source: string
  readonly packageSubdirectory?: string
  readonly catalogItemId?: string
  readonly expectedPackageName?: string
  readonly displayName?: string
}

interface ManagedPreview {
  readonly public: AppInstallPreview
  readonly builder: AppBuilderPreview
  readonly stagingRoot?: string
  readonly sourceRoot: string
  readonly finalDirectory: string
  readonly finalPackageDirectory: string
  readonly existingManagedDirectory: boolean
  readonly source: string
  readonly catalogItemId?: string
}

interface AppSourceReceipt {
  readonly schemaVersion: 1
  readonly appId: string
  readonly packageName: string
  readonly pluginKind?: AppInstallPluginKind
  readonly sourceKind: AppInstallSourceKind
  readonly source: string
  readonly sourceDirectory: string
  readonly installedAt: string
  readonly catalogItemId?: string
}

export interface AppPackageInventory {
  readonly catalogItemIds: ReadonlySet<string>
  readonly packageNames: ReadonlySet<string>
  readonly repositoryUrls: ReadonlySet<string>
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

function validatedPackageSubdirectory(value: string | undefined): string {
  const subdirectory = value?.trim() ?? ''
  if (subdirectory.length === 0) return ''
  if (
    subdirectory.length > 240
    || subdirectory.includes('\\')
    || subdirectory.startsWith('/')
    || subdirectory.endsWith('/')
    || subdirectory.split('/').some(segment => segment === '.' || segment === '..' || segment.length === 0)
  ) throw new Error('插件包子目录无效。')
  return subdirectory
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

async function locateRepositoryRoot(source: string, packageSubdirectory = ''): Promise<string> {
  let current = source
  for (let depth = 0; depth < 4; depth += 1) {
    const packageRoot = packageSubdirectory.length === 0
      ? current
      : join(current, ...packageSubdirectory.split('/'))
    if (await exists(join(packageRoot, 'package.json'))) return await realpath(current)
    const entries = (await readdir(current, { withFileTypes: true }))
      .filter(entry => entry.name !== '__MACOSX' && entry.name !== '.DS_Store')
    if (entries.length !== 1 || entries[0]?.isDirectory() !== true) break
    current = join(current, entries[0].name)
  }
  throw new Error('没有在安装源根目录中找到插件仓库 package.json。')
}

async function discoverPackageSubdirectory(sourceRoot: string, expectedPackageName: string): Promise<string> {
  const pending: Array<{ readonly path: string; readonly segments: readonly string[] }> = [{ path: sourceRoot, segments: [] }]
  const matches: string[] = []
  let visited = 0
  while (pending.length > 0) {
    const current = pending.shift()!
    visited += 1
    if (visited > 2_000) throw new Error('插件仓库包含过多目录，无法安全定位目录声明的包。')
    try {
      const bytes = await readFile(join(current.path, 'package.json'))
      if (bytes.byteLength <= 1024 * 1024) {
        const manifest: unknown = JSON.parse(bytes.toString('utf8'))
        if (isObject(manifest) && manifest.name === expectedPackageName) {
          matches.push(current.segments.join('/'))
        }
      }
    } catch (cause) {
      const code = isObject(cause) && typeof cause.code === 'string' ? cause.code : undefined
      if (code !== 'ENOENT' && !(cause instanceof SyntaxError)) throw cause
    }
    if (current.segments.length >= 4) continue
    const entries = await readdir(current.path, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || ['.git', '.pnpm-store', 'node_modules'].includes(entry.name)) continue
      pending.push({
        path: join(current.path, entry.name),
        segments: [...current.segments, entry.name],
      })
    }
  }
  if (matches.length === 0) throw new Error('仓库中没有找到 dshfind 声明的插件包。')
  if (matches.length > 1) throw new Error('仓库中存在多个同名插件包，无法确定安装目标。')
  return matches[0]!
}

function managedPluginId(packageName: string): string {
  const stem = packageName.split('/').at(-1)!
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 40)
    .replaceAll(/-+$/gu, '') || 'plugin'
  const digest = createHash('sha256').update(packageName).digest('hex').slice(0, 10)
  return `plugin-${stem}-${digest}`
}

async function readPluginIdentity(sourceRoot: string, displayName?: string): Promise<AppManifestIdentity> {
  const bytes = await readFile(join(sourceRoot, 'package.json'))
  if (bytes.byteLength > 1024 * 1024) throw new Error('插件 package.json 过大。')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!isObject(value) || typeof value.name !== 'string' || !PACKAGE_NAME_PATTERN.test(value.name)) {
    throw new Error('插件 package.json 缺少规范包名。')
  }
  const app = isObject(value.dsh) && isObject(value.dsh.app) ? value.dsh.app : undefined
  if (app !== undefined) {
    const appId = app.id
    const title = app.title
    if (typeof appId !== 'string' || !APP_ID_PATTERN.test(appId)) throw new Error('插件 dsh.app.id 无效。')
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > 120) {
      throw new Error('插件 dsh.app.title 无效。')
    }
    return { appId, title: title.trim(), pluginKind: 'app', packageName: value.name }
  }
  const title = displayName?.trim()
    || (typeof value.displayName === 'string' ? value.displayName.trim() : '')
    || value.name
  return {
    appId: managedPluginId(value.name),
    title: Array.from(title).slice(0, 120).join(''),
    pluginKind: 'plugin',
    packageName: value.name,
  }
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

function normalizedRepositorySource(source: string): string | undefined {
  try {
    const url = new URL(source)
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return undefined
    return `${url.origin}${url.pathname}`.toLowerCase().replace(/\.git$/u, '').replace(/\/$/u, '')
  } catch {
    return undefined
  }
}

function parsedSourceReceipt(value: unknown, expectedAppId?: string): AppSourceReceipt {
  if (!isObject(value)
    || value.schemaVersion !== 1
    || typeof value.appId !== 'string'
    || !APP_ID_PATTERN.test(value.appId)
    || expectedAppId !== undefined && value.appId !== expectedAppId
    || typeof value.packageName !== 'string'
    || !PACKAGE_NAME_PATTERN.test(value.packageName)
    || typeof value.source !== 'string'
    || typeof value.sourceDirectory !== 'string'
    || typeof value.installedAt !== 'string'
    || value.pluginKind !== undefined && value.pluginKind !== 'app' && value.pluginKind !== 'plugin'
    || value.catalogItemId !== undefined && (
      typeof value.catalogItemId !== 'string'
      || value.catalogItemId.length === 0
      || value.catalogItemId.length > 160
      || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(value.catalogItemId)
    )
    || !['git-repository', 'remote-zip', 'local-zip', 'local-directory'].includes(String(value.sourceKind))) {
    throw new Error('插件安装来源记录无效。')
  }
  return value as unknown as AppSourceReceipt
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

  async create(input: AppScaffoldInput, signal?: AbortSignal): Promise<AppCreateResult> {
    signal?.throwIfAborted()
    const scaffold = await scaffoldAppSource(this.pluginRoot, input)
    try {
      const preview = await this.preview(scaffold.sourceDirectory, signal)
      if (preview.appId !== scaffold.appId || preview.packageName !== scaffold.packageName) {
        await this.discard(preview.previewId)
        throw new Error('生成的 App 身份与安装预览不一致。')
      }
      const installed = await this.install(preview.previewId, signal)
      return Object.freeze({ ...installed, createdFromTemplate: true })
    } catch (cause) {
      throw new Error(
        `App 创建未完成；已保留源码目录 ${scaffold.sourceDirectory}。${errorMessage(cause)}`,
        { cause },
      )
    }
  }

  async preview(sourceValue: string | AppInstallSourceInput, signal?: AbortSignal): Promise<AppInstallPreview> {
    return await this.runExclusive(async () => {
      await this.purgeExpired()
      signal?.throwIfAborted()
      const input = typeof sourceValue === 'string' ? { source: sourceValue } : sourceValue
      const source = validatedSource(input.source)
      let packageSubdirectory = validatedPackageSubdirectory(input.packageSubdirectory)
      if (input.expectedPackageName !== undefined && !PACKAGE_NAME_PATTERN.test(input.expectedPackageName)) {
        throw new Error('目录声明的插件包名无效。')
      }
      if (input.catalogItemId !== undefined && (
        input.catalogItemId.length === 0
        || input.catalogItemId.length > 160
        || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(input.catalogItemId)
      )) throw new Error('目录插件 ID 无效。')
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
            sourceRoot = await locateRepositoryRoot(extracted, packageSubdirectory)
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
            sourceRoot = packageSubdirectory.length === 0 && input.expectedPackageName !== undefined
              ? await realpath(cloned)
              : await locateRepositoryRoot(cloned, packageSubdirectory)
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
              sourceRoot = packageSubdirectory.length === 0 && input.expectedPackageName !== undefined
                ? canonical
                : await locateRepositoryRoot(canonical, packageSubdirectory)
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
              sourceRoot = packageSubdirectory.length === 0 && input.expectedPackageName !== undefined
                ? await realpath(copied)
                : await locateRepositoryRoot(copied, packageSubdirectory)
            }
          } else {
            sourceKind = 'local-zip'
            const bytes = await readBoundedFile(local)
            if (!isZip(bytes)) throw new Error('本地文件不是 ZIP 包。')
            await mkdir(stagingRoot, { recursive: true, mode: 0o700 })
            const extracted = join(stagingRoot, 'archive')
            await extractZip(bytes, extracted)
            sourceRoot = await locateRepositoryRoot(extracted, packageSubdirectory)
          }
        }

        if (packageSubdirectory.length === 0 && input.expectedPackageName !== undefined) {
          packageSubdirectory = await discoverPackageSubdirectory(sourceRoot, input.expectedPackageName)
        }
        const sourcePackageRoot = packageSubdirectory.length === 0
          ? sourceRoot
          : resolve(sourceRoot, ...packageSubdirectory.split('/'))
        if (!isInside(sourceRoot, sourcePackageRoot)) throw new Error('插件包子目录越界。')
        const identity = await readPluginIdentity(sourcePackageRoot, input.displayName)
        const builder = await this.builder.preview({
          sourceDirectory: sourceRoot,
          ...(packageSubdirectory.length === 0 ? {} : { packageSubdirectory }),
        }, signal)
        builderPreview = builder
        if (builder.packageKind !== 'bundle') throw new Error('该插件没有声明可安装的 dsh.bundle。')
        if (!PACKAGE_NAME_PATTERN.test(builder.packageName)) throw new Error('插件包名无效。')
        if (builder.packageName !== identity.packageName) throw new Error('插件清单和构建计划的包名不一致。')
        if (input.expectedPackageName !== undefined && builder.packageName !== input.expectedPackageName) {
          throw new Error('仓库中的插件包名与 dshfind 目录不一致。')
        }
        const manifest = await profileManifest(this.profile)
        const profileState = profilePackageState(manifest, builder.packageName)
        if (profileState.bundled) throw new Error(`当前 profile 已加载 ${builder.packageName}。`)
        const finalDirectory = ownedStaging ? join(this.pluginRoot, identity.appId) : sourceRoot
        const finalPackageDirectory = packageSubdirectory.length === 0
          ? finalDirectory
          : resolve(finalDirectory, ...packageSubdirectory.split('/'))
        if (ownedStaging && await exists(finalDirectory)) {
          throw new Error(`插件目录已存在：${finalDirectory}。可直接输入该目录重新安装。`)
        }
        const publicPreview: AppInstallPreview = Object.freeze({
          previewId,
          appId: identity.appId,
          title: identity.title,
          pluginKind: identity.pluginKind,
          packageName: builder.packageName,
          version: builder.version,
          sourceKind,
          profileAction: profileState.dependency ? 'repair' : 'install',
          sourceDirectory: finalPackageDirectory,
          buildScript: builder.buildScript,
          buildMode: builder.buildRequired === false ? 'prebuilt' : 'source-build',
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
          finalPackageDirectory,
          existingManagedDirectory: !ownedStaging,
          source,
          ...(input.catalogItemId === undefined ? {} : { catalogItemId: input.catalogItemId }),
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
          ['add', '--save-exact', `link:${preview.finalPackageDirectory}`],
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
          pluginKind: preview.public.pluginKind,
          sourceKind: preview.public.sourceKind,
          source: preview.source,
          sourceDirectory: preview.finalPackageDirectory,
          installedAt: new Date(this.now()).toISOString(),
          ...(preview.catalogItemId === undefined ? {} : { catalogItemId: preview.catalogItemId }),
        })
        this.previews.delete(previewId)
        await this.builder.discard(preview.builder.previewId).catch(() => {})
        if (preview.stagingRoot !== undefined) await rm(preview.stagingRoot, { recursive: true, force: true })
        return Object.freeze({
          appId: preview.public.appId,
          title: preview.public.title,
          pluginKind: preview.public.pluginKind,
          packageName: preview.builder.packageName,
          version: preview.builder.version,
          sourceDirectory: preview.finalPackageDirectory,
          profileAction: preview.public.profileAction,
          completedAt: new Date(this.now()).toISOString(),
          installLog: build.logs.install,
          buildLog: build.logs.build,
          packageLog,
          restartRequired: true,
        })
      } catch (cause) {
        if (recoveryId !== undefined) {
          const restored = await this.pnpm.rollbackPluginInstall(recoveryId).catch(() => false)
          if (restored) await this.pnpm.acknowledgeRecoveredInstall(recoveryId).catch(() => {})
        }
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

  async inventory(): Promise<AppPackageInventory> {
    const manifest = await profileManifest(this.profile)
    const packageNames = new Set<string>()
    for (const packageName of Object.keys(profileDependencies(manifest))) {
      if (PACKAGE_NAME_PATTERN.test(packageName)) packageNames.add(packageName)
    }
    for (const packageName of profileBundles(manifest)) {
      if (typeof packageName === 'string' && PACKAGE_NAME_PATTERN.test(packageName)) packageNames.add(packageName)
    }
    const catalogItemIds = new Set<string>()
    const repositoryUrls = new Set<string>()
    const directory = join(this.pluginRoot, '.deepdeck', 'sources')
    let filenames: readonly string[] = []
    try {
      filenames = (await readdir(directory, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name)
    } catch (cause) {
      const code = isObject(cause) && typeof cause.code === 'string' ? cause.code : undefined
      if (code !== 'ENOENT') throw cause
    }
    for (const filename of filenames) {
      try {
        const receipt = parsedSourceReceipt(JSON.parse(await readFile(join(directory, filename), 'utf8')) as unknown)
        if (!packageNames.has(receipt.packageName)) continue
        if (receipt.catalogItemId !== undefined) catalogItemIds.add(receipt.catalogItemId)
        const repository = normalizedRepositorySource(receipt.source)
        if (repository !== undefined) repositoryUrls.add(repository)
      } catch {
        // A corrupt legacy receipt must not make the entire read-only catalog unavailable.
      }
    }
    return { catalogItemIds, packageNames, repositoryUrls }
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
    return parsedSourceReceipt(value, appId)
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
