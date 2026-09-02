import { createHash, randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { mkdir, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  APP_CONVERSATION_API_PATH,
  type AppConversationActionToolDefinition,
  type AppBuildValidationResult,
  type AppCreateResult,
  type AppRebuildResult,
  type AppRestartResult,
  type AppConversationHostDefinition,
  type AppConversationHostRegistry,
  type AppConversationWorkspace,
  type AppCreatorContext,
  type AppSettingsDescriptor,
  type AppUninstallResult,
  type AppUpdateContext,
  type AppWindowReloadReceipt,
} from './contracts.js'
import { installAppActionTools } from './action-tools.js'
import { AppApplyStateStore } from './app-apply-state.js'
import {
  DeepDeckAppPackageManager,
  type AppInstallerPnpm,
  type AppInstallerProfile,
} from './app-installer.js'
import { installAppCreatorMode } from './creator-tools.js'
import { snapshotAppWorkspace } from './creator-state.js'
import { DshfindAppMarket } from './app-market.js'
import { DeepDeckAppStore } from './app-store.js'

type JsonObject = Record<string, unknown>

interface WorkspaceEntity {
  readonly id: string
  readonly path: string
  readonly title: string
}

interface AppConversationHostContext {
  readonly workspaceRegistry: {
    create(path: string, title?: string): Promise<WorkspaceEntity>
  }
  readonly webServer: {
    register(route: {
      readonly kind: 'exact'
      readonly path: string
      readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
    }): () => void
  }
  readonly reflect: {
    provide(name: string, value: unknown): () => void
  }
  readonly bunPluginBuilder: AppBunBuilderService
  readonly desktopProfiles: { readonly current: AppInstallerProfile }
  readonly desktopPnpm: AppInstallerPnpm
  readonly desktopActions: {
    requestRestart(): Promise<void>
    reloadAppWindows?(path: string): Promise<AppWindowReloadReceipt>
  }
  readonly agentPresets: {
    composedPreset(agentContext: Context): string | undefined
  }
  readonly agents: {
    get(sessionId: string): {
      readonly id: string
      readonly ctx: Context
      readonly session: { readonly id: string; readonly header: { readonly cwd?: string } }
    } | undefined
  }
  readonly sessions: { flush(session: unknown): Promise<boolean> }
  readonly logger: { warn(message: string): void }
  effect(effect: () => unknown, label: string): unknown
}

interface AppBuildPreview {
  readonly previewId: string
  readonly packageName: string
  readonly version: string
  readonly packageKind: 'plugin' | 'bundle'
  readonly buildScript: string
  readonly buildRequired?: boolean
  readonly confirmation: string
  readonly frozenInstall: boolean
  readonly warnings: readonly string[]
  readonly hotUpdateAvailable: boolean
  readonly hotUpdateReason?: string
}

interface AppBuildInspection {
  readonly packageName: string
  readonly hotUpdateAvailable: boolean
  readonly hotUpdateReason?: string
}

interface AppBunBuilderService {
  isStatePath?(path: string): boolean
  inspect(input: { readonly sourceDirectory: string }, signal?: AbortSignal): Promise<AppBuildInspection>
  preview(input: {
    readonly sourceDirectory: string
    readonly packageSubdirectory?: string
  }, signal?: AbortSignal): Promise<AppBuildPreview>
  buildSource(input: {
    readonly previewId: string
    readonly confirmation: string
    readonly signal?: AbortSignal
  }): Promise<{
    readonly packageName: string
    readonly version: string
    readonly sourcePackageRoot: string
    readonly completedAt: string
    readonly logs: { readonly install: string; readonly build: string }
  }>
  hotUpdate(input: {
    readonly previewId: string
    readonly confirmation: string
    readonly signal?: AbortSignal
  }): Promise<{
    readonly packageName: string
    readonly completedAt: string
    readonly hostReloaded: boolean
    readonly buildLog: string
  }>
  discard(previewId: string): Promise<void>
}

const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const ACTION_TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const ACTION_EFFECT_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/

export const APP_WORKSPACE_DIRECTORY = join('DeepDeck', 'Apps')
export const inject = [
  'workspaceRegistry',
  'webServer',
  'bunPluginBuilder',
  'desktopProfiles',
  'desktopPnpm',
  'desktopActions',
  'agentPresets',
  'agents',
  'sessions',
  'tools',
  'skills',
  'systemPrompt',
] as const

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalPath(path: string): string {
  const absolute = resolve(path)
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

const PROCESS_GENERATION_KEY = Symbol.for('deepdeck.app-apply.process-generation')

/** Stable across Cordis/plugin HMR, new only when the Harness process is new. */
function runtimeProcessGeneration(): string {
  const processGlobal = globalThis as typeof globalThis & { [PROCESS_GENERATION_KEY]?: string }
  const existing = processGlobal[PROCESS_GENERATION_KEY]
  if (existing !== undefined) return existing
  const created = randomUUID()
  Object.defineProperty(processGlobal, PROCESS_GENERATION_KEY, {
    value: created,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return created
}

function normalizedDefinition(definition: AppConversationHostDefinition): AppConversationHostDefinition {
  const id = definition.id.trim()
  const title = definition.title.trim()
  const workspaceSlug = definition.workspaceSlug.trim()
  const workspaceTitle = definition.workspaceTitle?.trim()
  const packageName = definition.packageName.trim()
  const sourcePackageRoot = resolve(definition.sourcePackageRoot)
  const appWindowPath = definition.appWindowPath?.trim()
  const actionTools = definition.actionTools?.map((tool): AppConversationActionToolDefinition => {
    const name = tool.name.trim()
    const description = tool.description.trim()
    const effect = tool.effect.trim()
    if (!ACTION_TOOL_NAME_PATTERN.test(name)) throw new Error(`invalid App action tool name '${name}'`)
    if (description.length === 0) throw new Error(`App action tool '${name}' needs a description`)
    if (!ACTION_EFFECT_PATTERN.test(effect)) throw new Error(`invalid App action effect '${effect}'`)
    if (
      !isObject(tool.parameters)
      || tool.parameters.type !== 'object'
      || tool.parameters.additionalProperties !== false
      || !isObject(tool.parameters.properties)
      || (tool.parameters.required !== undefined
        && (!Array.isArray(tool.parameters.required)
          || !tool.parameters.required.every(value => typeof value === 'string')))
    ) throw new Error(`App action tool '${name}' has invalid parameters`)
    return {
      name,
      description,
      effect,
      parameters: tool.parameters,
    }
  })
  if (actionTools !== undefined && new Set(actionTools.map(tool => tool.name)).size !== actionTools.length) {
    throw new Error('App action tool names must be unique')
  }
  if (!APP_ID_PATTERN.test(id)) throw new Error(`invalid app conversation id '${id}'`)
  if (!APP_ID_PATTERN.test(workspaceSlug)) throw new Error(`invalid app workspace slug '${workspaceSlug}'`)
  if (title.length === 0) throw new Error('app conversation title must not be blank')
  if (workspaceTitle !== undefined && workspaceTitle.length === 0) {
    throw new Error('app workspace title must not be blank')
  }
  if (!PACKAGE_NAME_PATTERN.test(packageName)) throw new Error(`invalid app package name '${packageName}'`)
  if (!isAbsolute(definition.sourcePackageRoot)) throw new Error('app source package root must be absolute')
  if (appWindowPath !== undefined) {
    const parsed = new URL(appWindowPath, 'http://deepdeck.local')
    if (
      !appWindowPath.startsWith('/')
      || appWindowPath.startsWith('//')
      || parsed.origin !== 'http://deepdeck.local'
      || parsed.pathname !== appWindowPath
      || parsed.search.length > 0
      || parsed.hash.length > 0
    ) throw new Error('app window path must be an absolute same-origin pathname')
  }
  return {
    id,
    title,
    workspaceSlug,
    packageName,
    sourcePackageRoot,
    ...(workspaceTitle === undefined ? {} : { workspaceTitle }),
    ...(appWindowPath === undefined ? {} : { appWindowPath }),
    ...(actionTools === undefined || actionTools.length === 0 ? {} : { actionTools }),
  }
}

export class DefaultAppConversationHostRegistry implements AppConversationHostRegistry {
  private readonly definitions = new Map<string, AppConversationHostDefinition>()
  private readonly sourceDefinitions = new Map<string, Pick<AppConversationHostDefinition, 'packageName' | 'sourcePackageRoot'>>()
  private readonly applyQueues = new Map<string, Promise<void>>()
  private readonly clientGenerations = new Map<string, number>()
  private readonly clientWaiters = new Map<string, Set<() => void>>()

  constructor(
    private readonly workspaceRegistry: AppConversationHostContext['workspaceRegistry'],
    private readonly home = homedir(),
    private readonly builder?: AppBunBuilderService,
    private readonly packages?: DeepDeckAppPackageManager,
    private readonly reloadAppWindows?: (path: string) => Promise<AppWindowReloadReceipt>,
    private readonly stateStore = new AppApplyStateStore(
      join(process.env.DSH_HOME ?? join(home, '.dsh'), 'deepdeck', 'app-apply-state.json'),
      runtimeProcessGeneration(),
    ),
  ) {}

  register(rawDefinition: AppConversationHostDefinition): () => void {
    let definition = normalizedDefinition(rawDefinition)
    const existing = this.definitions.get(definition.id)
    if (existing !== undefined) {
      throw new Error(`app conversation '${definition.id}' is already registered`)
    }
    const rememberedSource = this.sourceDefinitions.get(definition.id)
    if (this.builder?.isStatePath?.(definition.sourcePackageRoot) === true) {
      if (rememberedSource === undefined || rememberedSource.packageName !== definition.packageName) {
        throw new Error(`app conversation '${definition.id}' cannot register a Builder staging directory as its source`)
      }
      definition = { ...definition, sourcePackageRoot: rememberedSource.sourcePackageRoot }
    } else {
      this.sourceDefinitions.set(definition.id, {
        packageName: definition.packageName,
        sourcePackageRoot: definition.sourcePackageRoot,
      })
    }
    this.definitions.set(definition.id, definition)
    void this.stateStore.promoteRestarted(
      definition.id,
      definition.packageName,
      definition.sourcePackageRoot,
    ).catch(() => {})
    return () => {
      if (this.definitions.get(definition.id) === definition) this.definitions.delete(definition.id)
    }
  }

  has(appId: string): boolean {
    return this.definitions.has(appId.trim().toLowerCase())
  }

  async resolve(appId: string): Promise<AppConversationWorkspace> {
    const definition = this.definition(appId)
    const path = join(this.home, APP_WORKSPACE_DIRECTORY, definition.workspaceSlug)
    await mkdir(path, { recursive: true })
    const title = definition.workspaceTitle ?? `Apps · ${definition.title}`
    const workspace = await this.workspaceRegistry.create(path, title)
    return {
      appId: definition.id,
      path: workspace.path,
      title: workspace.title,
      workspaceId: String(workspace.id),
    }
  }

  async resolveCreator(appId: string): Promise<AppConversationWorkspace> {
    const definition = this.definition(appId)
    const workspace = await this.workspaceRegistry.create(
      definition.sourcePackageRoot,
      `Creator · ${definition.title}`,
    )
    return {
      appId: definition.id,
      path: workspace.path,
      title: workspace.title,
      workspaceId: String(workspace.id),
    }
  }

  actionTools(
    appId: string,
    cwd: string,
    names: readonly string[],
  ): readonly AppConversationActionToolDefinition[] {
    const definition = this.definition(appId)
    const expectedWorkspace = canonicalPath(join(this.home, APP_WORKSPACE_DIRECTORY, definition.workspaceSlug))
    if (canonicalPath(cwd) !== expectedWorkspace) {
      throw new Error('The App Agent Workspace does not match the dispatched App.')
    }
    if (names.length === 0 || new Set(names).size !== names.length) {
      throw new Error('Dispatched App action tools must be a non-empty unique list.')
    }
    const registered = new Map((definition.actionTools ?? []).map(tool => [tool.name, tool]))
    return names.map((name) => {
      const tool = registered.get(name)
      if (tool === undefined) throw new Error(`App action tool '${name}' is not registered for '${definition.id}'.`)
      return tool
    })
  }

  /** Recover pre-persistence App bindings from an older request/header tool list. */
  legacyActionToolBinding(
    cwd: string,
    requestToolNames: readonly string[],
  ): { readonly appId: string; readonly toolNames: readonly string[] } | undefined {
    const workspace = canonicalPath(cwd)
    const definition = [...this.definitions.values()].find(candidate => (
      canonicalPath(join(this.home, APP_WORKSPACE_DIRECTORY, candidate.workspaceSlug)) === workspace
    ))
    if (definition === undefined) return undefined
    const requested = new Set(requestToolNames)
    const toolNames = (definition.actionTools ?? [])
      .map(tool => tool.name)
      .filter(name => requested.has(name))
    return toolNames.length === 0
      ? undefined
      : Object.freeze({ appId: definition.id, toolNames: Object.freeze(toolNames) })
  }

  isCreatorSource(cwd: string): boolean {
    const source = canonicalPath(cwd)
    return [...this.definitions.values()].some(
      definition => canonicalPath(definition.sourcePackageRoot) === source,
    )
  }

  async creatorContext(cwd: string, signal?: AbortSignal): Promise<AppCreatorContext> {
    const definition = await this.definitionForSource(cwd, signal)
    const descriptor = await this.describe(definition, signal)
    return {
      appId: descriptor.id,
      title: descriptor.title,
      packageName: descriptor.packageName,
      sourcePackageRoot: definition.sourcePackageRoot,
      rebuildAvailable: descriptor.rebuildAvailable,
      ...(descriptor.rebuildReason === undefined ? {} : { rebuildReason: descriptor.rebuildReason }),
      applyState: await this.stateStore.get(
        definition.id,
        definition.packageName,
        definition.sourcePackageRoot,
      ),
    }
  }

  async applyState(cwd: string, signal?: AbortSignal) {
    const definition = await this.definitionForSource(cwd, signal)
    return await this.stateStore.get(
      definition.id,
      definition.packageName,
      definition.sourcePackageRoot,
    )
  }

  async changedFilesSinceApply(
    cwd: string,
    currentFiles: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) {
    const definition = await this.definitionForSource(cwd, signal)
    return await this.stateStore.changedFiles(
      definition.id,
      definition.packageName,
      definition.sourcePackageRoot,
      currentFiles,
    )
  }

  noteClientReady(appId: string): void {
    const id = appId.trim().toLowerCase()
    if (!this.definitions.has(id)) throw new Error(`unknown app conversation '${appId}'`)
    this.clientGenerations.set(id, (this.clientGenerations.get(id) ?? 0) + 1)
    for (const wake of this.clientWaiters.get(id) ?? []) wake()
    this.clientWaiters.delete(id)
  }

  async list(signal?: AbortSignal): Promise<readonly AppSettingsDescriptor[]> {
    signal?.throwIfAborted()
    return [...this.definitions.values()]
      .sort((left, right) => left.title.localeCompare(right.title))
      .map(definition => ({
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        updateAvailable: this.packages !== undefined,
        rebuildAvailable: this.builder !== undefined,
        uninstallAvailable: this.packages !== undefined,
      }))
  }

  async inspectList(signal?: AbortSignal): Promise<readonly AppSettingsDescriptor[]> {
    const definitions = [...this.definitions.values()]
      .sort((left, right) => left.title.localeCompare(right.title))
    return await Promise.all(definitions.map(async definition => await this.describe(definition, signal)))
  }

  async updateContext(appId: string, signal?: AbortSignal): Promise<AppUpdateContext> {
    signal?.throwIfAborted()
    if (this.packages === undefined) throw new Error('App package manager is unavailable.')
    const definition = this.definition(appId)
    const source = await this.packages.updateSource(
      definition.id,
      definition.packageName,
      definition.sourcePackageRoot,
    )
    return {
      appId: definition.id,
      title: definition.title,
      packageName: definition.packageName,
      ...source,
    }
  }

  async rebuild(appId: string, signal?: AbortSignal): Promise<AppRebuildResult> {
    const definition = this.definition(appId)
    return await this.serializeApply(definition.id, async () => await this.rebuildNow(definition, signal))
  }

  private async rebuildNow(
    definition: AppConversationHostDefinition,
    signal?: AbortSignal,
  ): Promise<AppRebuildResult> {
    signal?.throwIfAborted()
    if (this.builder === undefined) throw new Error('Bun Builder is unavailable.')
    const startedAt = Date.now()
    const applyId = randomUUID()
    const clientGeneration = this.clientGenerations.get(definition.id)
    let preview: AppBuildPreview | undefined
    try {
      preview = await this.builder.preview({ sourceDirectory: definition.sourcePackageRoot }, signal)
      if (preview.packageName !== definition.packageName) {
        throw new Error('the registered App package identity does not match its source')
      }
      if (!preview.hotUpdateAvailable) {
        throw new Error(preview.hotUpdateReason ?? 'This App cannot be rebuilt in place.')
      }
      const result = await this.builder.hotUpdate({
        previewId: preview.previewId,
        confirmation: preview.confirmation,
        ...(signal === undefined ? {} : { signal }),
      })
      let appWindows: AppWindowReloadReceipt = { matched: 0, reloaded: 0, failed: 0 }
      let appWindowsReloadError: string | undefined
      const [clientReload] = await Promise.all([
        clientGeneration === undefined
          ? Promise.resolve(false)
          : this.waitForClientReady(definition.id, clientGeneration, signal),
        this.reloadAppWindows === undefined
          ? Promise.resolve()
          : this.reloadAppWindows(definition.appWindowPath ?? `/apps/${definition.id}`).then(
              receipt => { appWindows = receipt },
              error => { appWindowsReloadError = errorMessage(error) },
            ),
      ])
      // The build already succeeded. Finalize its durable receipt even if the
      // initiating request disconnects while runtime acknowledgements run.
      const snapshot = await snapshotAppWorkspace(definition.sourcePackageRoot)
      const outputRevision = createHash('sha256')
        .update(definition.packageName).update('\0')
        .update(applyId).update('\0')
        .update(snapshot.digest)
        .digest('hex')
      const hostRuntime = result.hostReloaded ? 'confirmed' as const : 'not-confirmed' as const
      const clientRuntime = clientReload ? 'confirmed' as const : 'not-observed' as const
      const userActionRequired = !result.hostReloaded
        ? 'verify-host-runtime' as const
        : clientReload || appWindows.reloaded > 0
          ? null
          : 'reopen-app-window' as const
      await this.stateStore.recordApplied({
        appId: definition.id,
        packageName: result.packageName,
        sourcePackageRoot: definition.sourcePackageRoot,
        sourceDigest: snapshot.digest,
        sourceFiles: Object.fromEntries(snapshot.files),
        applyId,
        appliedAt: result.completedAt,
        outputRevision,
      })
      return {
        appId: definition.id,
        packageName: result.packageName,
        applyId,
        sourceDigest: snapshot.digest,
        outputRevision,
        completedAt: result.completedAt,
        durationMs: Date.now() - startedAt,
        buildSucceeded: true,
        hostReloaded: result.hostReloaded,
        hostRuntime,
        clientReload: clientRuntime,
        clientRuntime,
        appWindowsMatched: appWindows.matched,
        appWindowsReloaded: appWindows.reloaded,
        appWindowsFailed: appWindows.failed,
        ...(appWindowsReloadError === undefined ? {} : { appWindowsReloadError }),
        userActionRequired,
        buildLog: result.buildLog,
      }
    } finally {
      if (preview !== undefined) await this.builder.discard(preview.previewId).catch(() => {})
    }
  }

  async rebuildCreator(cwd: string, signal?: AbortSignal): Promise<AppRebuildResult> {
    return await this.rebuild((await this.definitionForSource(cwd, signal)).id, signal)
  }

  async validateCreator(cwd: string, signal?: AbortSignal): Promise<AppBuildValidationResult> {
    const definition = await this.definitionForSource(cwd, signal)
    return await this.serializeApply(definition.id, async () => await this.validateCreatorNow(definition, signal))
  }

  private async validateCreatorNow(
    definition: AppConversationHostDefinition,
    signal?: AbortSignal,
  ): Promise<AppBuildValidationResult> {
    signal?.throwIfAborted()
    if (this.builder === undefined) throw new Error('Bun Builder is unavailable.')
    const startedAt = Date.now()
    const applyId = randomUUID()
    let preview: AppBuildPreview | undefined
    try {
      preview = await this.builder.preview({ sourceDirectory: definition.sourcePackageRoot }, signal)
      if (preview.packageName !== definition.packageName) {
        throw new Error('the registered App package identity does not match its source')
      }
      const result = await this.builder.buildSource({
        previewId: preview.previewId,
        confirmation: preview.confirmation,
        ...(signal === undefined ? {} : { signal }),
      })
      // A successful structural build must always become a durable queued
      // revision; caller cancellation cannot turn it back into "unknown".
      const snapshot = await snapshotAppWorkspace(definition.sourcePackageRoot)
      const outputRevision = createHash('sha256')
        .update(definition.packageName).update('\0')
        .update(applyId).update('\0')
        .update(snapshot.digest)
        .digest('hex')
      await this.stateStore.recordRestartQueued({
        appId: definition.id,
        packageName: result.packageName,
        sourcePackageRoot: definition.sourcePackageRoot,
        sourceDigest: snapshot.digest,
        sourceFiles: Object.fromEntries(snapshot.files),
        applyId,
        appliedAt: result.completedAt,
        outputRevision,
      })
      return {
        appId: definition.id,
        packageName: result.packageName,
        applyId,
        sourceDigest: snapshot.digest,
        outputRevision,
        completedAt: result.completedAt,
        durationMs: Date.now() - startedAt,
        buildSucceeded: true,
        runtimeRestart: 'queued-after-turn-flush',
        userActionRequired: 'restart-pending',
        installLog: result.logs.install,
        buildLog: result.logs.build,
      }
    } finally {
      if (preview !== undefined) await this.builder.discard(preview.previewId).catch(() => {})
    }
  }

  async restartCreator(cwd: string, signal?: AbortSignal): Promise<AppRestartResult> {
    if (this.packages === undefined) throw new Error('App package manager is unavailable.')
    const definition = await this.definitionForSource(cwd, signal)
    signal?.throwIfAborted()
    await this.packages.requestRestart()
    return Object.freeze({
      appId: definition.id,
      packageName: definition.packageName,
      restartScheduled: true,
    })
  }

  async uninstall(appId: string, signal?: AbortSignal): Promise<AppUninstallResult> {
    if (this.packages === undefined) throw new Error('App package manager is unavailable.')
    const definition = this.definition(appId)
    return await this.packages.uninstall(definition.packageName, definition.sourcePackageRoot, signal)
  }

  private async serializeApply<T>(appId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.applyQueues.get(appId) ?? Promise.resolve()
    const result = previous.then(operation)
    const settled = result.then(() => undefined, () => undefined)
    this.applyQueues.set(appId, settled)
    try {
      return await result
    } finally {
      if (this.applyQueues.get(appId) === settled) this.applyQueues.delete(appId)
    }
  }

  private async waitForClientReady(
    appId: string,
    previousGeneration: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if ((this.clientGenerations.get(appId) ?? 0) > previousGeneration) return true
    return await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (value: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', aborted)
        waiters.delete(ready)
        if (waiters.size === 0) this.clientWaiters.delete(appId)
        resolve(value)
      }
      const ready = (): void => finish((this.clientGenerations.get(appId) ?? 0) > previousGeneration)
      const aborted = (): void => finish(false)
      const waiters = this.clientWaiters.get(appId) ?? new Set<() => void>()
      this.clientWaiters.set(appId, waiters)
      waiters.add(ready)
      const timeout = setTimeout(() => finish(false), 3_000)
      signal?.addEventListener('abort', aborted, { once: true })
    })
  }

  private definition(appId: string): AppConversationHostDefinition {
    const definition = this.definitions.get(appId)
    if (definition === undefined) throw new Error(`unknown app conversation '${appId}'`)
    return definition
  }

  private async definitionForSource(
    cwd: string,
    signal?: AbortSignal,
  ): Promise<AppConversationHostDefinition> {
    signal?.throwIfAborted()
    const source = await realpath(resolve(cwd)).catch(() => resolve(cwd))
    for (const definition of this.definitions.values()) {
      signal?.throwIfAborted()
      const registered = await realpath(definition.sourcePackageRoot)
        .catch(() => resolve(definition.sourcePackageRoot))
      if (registered === source) return definition
    }
    throw new Error(
      'This Creator Workspace is not a registered DeepDeck App source. Launch Vibe Coding from Settings > Apps.',
    )
  }

  private async describe(
    definition: AppConversationHostDefinition,
    signal?: AbortSignal,
  ): Promise<AppSettingsDescriptor> {
    signal?.throwIfAborted()
    const uninstall = this.packages === undefined
      ? { available: false, reason: 'App package manager is unavailable.' }
      : await this.packages.uninstallAvailability(definition.packageName)
    const update = this.packages === undefined
      ? { available: false, reason: 'App package manager is unavailable.' }
      : await this.packages.updateAvailability(
          definition.id,
          definition.packageName,
          definition.sourcePackageRoot,
        )
    if (this.builder === undefined) {
      return {
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        updateAvailable: update.available,
        ...(update.reason === undefined ? {} : { updateReason: update.reason }),
        rebuildAvailable: false,
        rebuildReason: 'Bun Builder is unavailable.',
        uninstallAvailable: uninstall.available,
        ...(uninstall.reason === undefined ? {} : { uninstallReason: uninstall.reason }),
      }
    }
    try {
      // Settings listing must stay lightweight. Rebuild performs the authoritative
      // frozen-source preview again before any local code can execute.
      const inspection = await this.builder.inspect({ sourceDirectory: definition.sourcePackageRoot }, signal)
      if (inspection.packageName !== definition.packageName) {
        throw new Error('the registered App package identity does not match its source')
      }
      return {
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        updateAvailable: update.available,
        ...(update.reason === undefined ? {} : { updateReason: update.reason }),
        rebuildAvailable: inspection.hotUpdateAvailable,
        uninstallAvailable: uninstall.available,
        ...(uninstall.reason === undefined ? {} : { uninstallReason: uninstall.reason }),
        ...(inspection.hotUpdateAvailable
          ? {}
          : { rebuildReason: inspection.hotUpdateReason ?? 'This App cannot be rebuilt in place.' }),
      }
    } catch (error) {
      return {
        id: definition.id,
        title: definition.title,
        packageName: definition.packageName,
        updateAvailable: update.available,
        ...(update.reason === undefined ? {} : { updateReason: update.reason }),
        rebuildAvailable: false,
        rebuildReason: errorMessage(error),
        uninstallAvailable: uninstall.available,
        ...(uninstall.reason === undefined ? {} : { uninstallReason: uninstall.reason }),
      }
    }
  }
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 32 * 1024) throw new Error('request body exceeds 32 KiB')
    chunks.push(buffer)
  }
  const value: unknown = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!isObject(value)) throw new Error('request body must be a JSON object')
  return value
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sameOrigin(request: IncomingMessage): boolean {
  const host = request.headers.host
  const origin = request.headers.origin
  if (typeof host !== 'string' || typeof origin !== 'string') return false
  try {
    const value = new URL(origin)
    return (value.protocol === 'http:' || value.protocol === 'https:') && value.host === host
  } catch {
    return false
  }
}

function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  return address === '127.0.0.1'
    || address === '::1'
    || address?.startsWith('::ffff:127.') === true
}

export async function apply(ctx: AppConversationHostContext): Promise<void> {
  const packages = new DeepDeckAppPackageManager({
    builder: ctx.bunPluginBuilder,
    profile: ctx.desktopProfiles.current,
    pnpm: ctx.desktopPnpm,
    requestRestart: async () => await ctx.desktopActions.requestRestart(),
  })
  const appStore = new DeepDeckAppStore()
  const pluginMarket = new DshfindAppMarket()
  const registry = new DefaultAppConversationHostRegistry(
    ctx.workspaceRegistry,
    homedir(),
    ctx.bunPluginBuilder,
    packages,
    ctx.desktopActions.reloadAppWindows === undefined
      ? undefined
      : async path => await ctx.desktopActions.reloadAppWindows!(path),
  )
  ctx.effect(
    () => () => { void packages.close() },
    'deepdeck app conversations: package manager lifecycle',
  )
  ctx.effect(
    () => ctx.reflect.provide('appConversations', registry),
    'deepdeck app conversations: host registry',
  )
  let creatorMode: ReturnType<typeof installAppCreatorMode> | undefined
  const actionTools = installAppActionTools(
    ctx as unknown as Parameters<typeof installAppActionTools>[0],
    registry,
  )
  ctx.effect(
    () => () => { actionTools.dispose() },
    'deepdeck app conversations: session-bound Agent tools',
  )
  ctx.effect(
    () => {
      creatorMode = installAppCreatorMode(
        ctx as unknown as Parameters<typeof installAppCreatorMode>[0],
        registry,
      )
      return () => {
        creatorMode?.()
        creatorMode = undefined
      }
    },
    'deepdeck app conversations: Creator mode tools',
  )
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: APP_CONVERSATION_API_PATH,
    async handler(request, response) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      const controller = new AbortController()
      request.once('aborted', () => controller.abort())
      response.once('close', () => {
        if (!response.writableEnded) controller.abort()
      })
      try {
        const body = await readJsonBody(request)
        if (body.action === 'list-apps') {
          sendJson(response, 200, { apps: await registry.list(controller.signal) })
          return
        }
        if (body.action === 'inspect-apps') {
          sendJson(response, 200, { apps: await registry.inspectList(controller.signal) })
          return
        }
        if (
          body.action === 'list-market'
          && (body.kind === 'apps' || body.kind === 'plugins')
          && typeof body.query === 'string'
          && (body.cursor === undefined || typeof body.cursor === 'string')
        ) {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          const inventory = await packages.inventory()
          sendJson(response, 200, {
            market: await (body.kind === 'apps' ? appStore : pluginMarket).list(
              body.query,
              body.cursor,
              inventory,
              controller.signal,
            ),
          })
          return
        }
        if (body.action === 'client-ready' && typeof body.appId === 'string') {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: 'same-origin request required' })
            return
          }
          registry.noteClientReady(body.appId)
          sendJson(response, 200, { ready: true })
          return
        }
        if (
          body.action === 'creator-ready'
          && typeof body.appId === 'string'
          && typeof body.sessionId === 'string'
        ) {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          if (creatorMode === undefined) throw new Error('Creator runtime is not active.')
          sendJson(response, 200, {
            creator: await creatorMode.assertReady(body.sessionId, body.appId, controller.signal),
          })
          return
        }
        if (
          body.action === 'begin-agent-action'
          && typeof body.sessionId === 'string'
          && typeof body.appId === 'string'
          && Array.isArray(body.toolNames)
          && body.toolNames.every(name => typeof name === 'string')
        ) {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, {
            execution: await actionTools.begin({
              sessionId: body.sessionId,
              appId: body.appId,
              toolNames: body.toolNames,
            }),
          })
          return
        }
        if (
          body.action === 'read-agent-action-effects'
          && typeof body.executionId === 'string'
          && typeof body.afterSequence === 'number'
        ) {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, {
            effectPage: actionTools.read(body.executionId, body.afterSequence),
          })
          return
        }
        if (body.action === 'finish-agent-action' && typeof body.executionId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          actionTools.finish(body.executionId)
          sendJson(response, 200, { finished: true })
          return
        }
        if (body.action === 'create-app' && typeof body.appId === 'string' && typeof body.title === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          if (registry.has(body.appId)) {
            sendJson(response, 409, { error: `App '${body.appId}' 已在当前 profile 中加载。` })
            return
          }
          const created: AppCreateResult = await packages.create({ id: body.appId, title: body.title }, controller.signal)
          sendJson(response, 200, { created })
          return
        }
        if (body.action === 'rebuild' && typeof body.appId === 'string') {
          if (!sameOrigin(request)) {
            sendJson(response, 403, { error: 'same-origin request required' })
            return
          }
          sendJson(response, 200, { rebuild: await registry.rebuild(body.appId, controller.signal) })
          return
        }
        if (body.action === 'preview-install' && typeof body.source === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, { installPreview: await packages.preview(body.source, controller.signal) })
          return
        }
        if (
          body.action === 'preview-market-install'
          && (body.kind === 'apps' || body.kind === 'plugins')
          && typeof body.itemId === 'string'
        ) {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          const item = body.kind === 'apps'
            ? appStore.resolve(body.itemId)
            : await pluginMarket.resolve(body.itemId, controller.signal)
          const installPreview = await packages.preview({
            source: item.repository.url,
            ...(item.repository.subdirectory === undefined
              ? {}
              : { packageSubdirectory: item.repository.subdirectory }),
            catalogItemId: item.id,
            ...(item.packageName === undefined ? {} : { expectedPackageName: item.packageName }),
            displayName: item.displayName,
          }, controller.signal)
          if (body.kind === 'apps' && installPreview.pluginKind !== 'app') {
            await packages.discard(installPreview.previewId)
            throw new Error('dshfind 条目不再声明有效的 dsh.app。')
          }
          sendJson(response, 200, {
            installPreview,
          })
          return
        }
        if (body.action === 'install' && typeof body.previewId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, { install: await packages.install(body.previewId, controller.signal) })
          return
        }
        if (body.action === 'discard-install' && typeof body.previewId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          await packages.discard(body.previewId)
          sendJson(response, 200, { discarded: true })
          return
        }
        if (body.action === 'uninstall' && typeof body.appId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, { uninstall: await registry.uninstall(body.appId, controller.signal) })
          return
        }
        if (body.action === 'resolve-update-context' && typeof body.appId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, { updateContext: await registry.updateContext(body.appId, controller.signal) })
          return
        }
        if (body.action === 'restart') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          await packages.requestRestart()
          sendJson(response, 200, { restarting: true })
          return
        }
        if (body.action === 'resolve-workspace' && typeof body.appId === 'string') {
          sendJson(response, 200, { workspace: await registry.resolve(body.appId) })
          return
        }
        if (body.action === 'resolve-creator-workspace' && typeof body.appId === 'string') {
          if (!sameOrigin(request) || !isLoopback(request)) {
            sendJson(response, 403, { error: 'local same-origin request required' })
            return
          }
          sendJson(response, 200, { workspace: await registry.resolveCreator(body.appId) })
          return
        }
        if (body.action === 'focus-main-window') {
          const sent = typeof process.send === 'function'
            ? process.send({ type: 'deepdeck:focus-main-window' })
            : false
          sendJson(response, 200, { sent })
          return
        }
        sendJson(response, 400, { error: 'unknown action' })
      } catch (error) {
        if (!response.writableEnded && !response.destroyed) {
          sendJson(response, 400, { error: errorMessage(error) })
        }
      }
    },
  }), 'deepdeck app conversations: host route')
}
