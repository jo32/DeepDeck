export const APP_CONVERSATION_API_PATH = '/api/deepdeck/app-conversations'
export const APP_CONVERSATION_CHANNEL = 'deepdeck-app-conversations-v1'
export const APP_CREATOR_PROTOCOL_VERSION = 2
export const APP_CONVERSATION_PAGE_SOURCE = 'deepdeck-app-page'
export const APP_CONVERSATION_RUNTIME_SOURCE = 'deepdeck-app-runtime'

export type AppConversationPreviewStatus =
  | 'preparing'
  | 'running'
  | 'attention'
  | 'completed'
  | 'failed'

export interface AppConversationPageInvokeMessage {
  readonly source: typeof APP_CONVERSATION_PAGE_SOURCE
  readonly type: 'invoke'
  readonly clientId: string
  readonly requestId: string
  readonly appId: string
  readonly actionId: string
  readonly payload: unknown
  readonly sessionId?: string
  /** Open the canonical Session as soon as the prompt has been accepted. */
  readonly openSession?: boolean
}

export interface AppConversationPageOpenMessage {
  readonly source: typeof APP_CONVERSATION_PAGE_SOURCE
  readonly type: 'open-session'
  readonly clientId: string
  readonly requestId: string
  readonly sessionId: string
}

export type AppConversationPageMessage =
  | AppConversationPageInvokeMessage
  | AppConversationPageOpenMessage

export interface AppConversationPreviewMessage {
  readonly source: typeof APP_CONVERSATION_RUNTIME_SOURCE
  readonly type: 'preview-state'
  readonly targetClientId: string
  readonly requestId: string
  readonly appId: string
  readonly status: AppConversationPreviewStatus
  readonly sessionId?: string
  readonly title?: string
  readonly content?: string
  readonly error?: string
}

export interface AppConversationHostDefinition {
  readonly id: string
  readonly title: string
  readonly workspaceSlug: string
  readonly workspaceTitle?: string
  /** Canonical package identity used by the Bun rebuild boundary. */
  readonly packageName: string
  /** Local package root whose reviewed build script may be run in place. */
  readonly sourcePackageRoot: string
  /** Optional same-origin page promoted into a DeepDeck secondary App window. */
  readonly appWindowPath?: string
}

export interface AppSettingsDescriptor {
  readonly id: string
  readonly title: string
  readonly packageName: string
  readonly updateAvailable: boolean
  readonly updateReason?: string
  readonly rebuildAvailable: boolean
  readonly rebuildReason?: string
  readonly uninstallAvailable: boolean
  readonly uninstallReason?: string
}

export interface AppMarketRepository {
  readonly url: string
  readonly subdirectory?: string
}

/** One validated App or plugin catalog row after profile reconciliation. */
export interface AppMarketItem {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly summary: string
  readonly description?: string
  readonly homepage?: string
  readonly latestVersion?: string
  readonly license?: string
  readonly categories: readonly string[]
  readonly keywords: readonly string[]
  readonly repository: AppMarketRepository
  readonly packageName?: string
  readonly publisher?: string
  readonly updatedAt?: string
  readonly installed: boolean
}

export interface AppMarketPage {
  readonly items: readonly AppMarketItem[]
  readonly nextCursor?: string
  readonly total?: number
}

export type AppMarketKind = 'apps' | 'plugins'

/** Trusted source provenance supplied to a dedicated Creator update task. */
export interface AppUpdateContext {
  readonly appId: string
  readonly title: string
  readonly packageName: string
  readonly sourceDirectory: string
  readonly sourceKind: AppInstallSourceKind
  /** Omitted for legacy Git installs; the Agent discovers their configured remote. */
  readonly source?: string
}

export interface AppRebuildResult {
  readonly appId: string
  readonly packageName: string
  readonly applyId: string
  readonly sourceDigest: string
  readonly outputRevision: string
  readonly completedAt: string
  readonly durationMs: number
  readonly buildSucceeded: true
  readonly hostReloaded: boolean
  readonly hostRuntime: 'confirmed' | 'not-confirmed'
  /** Target Client registration observed after the HMR request, when available. */
  readonly clientReload: 'confirmed' | 'not-observed'
  readonly clientRuntime: 'confirmed' | 'not-observed'
  /** Secondary App windows matched and completed/failed a reload against the new Host output. */
  readonly appWindowsMatched: number
  readonly appWindowsReloaded: number
  readonly appWindowsFailed: number
  readonly appWindowsReloadError?: string
  readonly userActionRequired: 'reopen-app-window' | 'verify-host-runtime' | null
  readonly buildLog: string
}

/** A reviewed in-place build that intentionally waits for a full runtime restart. */
export interface AppBuildValidationResult {
  readonly appId: string
  readonly packageName: string
  readonly applyId: string
  readonly sourceDigest: string
  readonly outputRevision: string
  readonly completedAt: string
  readonly durationMs: number
  readonly buildSucceeded: true
  readonly runtimeRestart: 'queued-after-turn-flush'
  readonly userActionRequired: 'restart-pending'
  readonly installLog: string
  readonly buildLog: string
}

/** One authoritative Creator apply outcome. */
export interface AppApplyResult {
  readonly appId: string
  readonly packageName: string
  readonly applyId: string
  readonly sourceDigest: string
  readonly outputRevision: string
  readonly completedAt: string
  readonly durationMs: number
  readonly outcome: 'hot-reloaded' | 'restart-queued'
  readonly buildSucceeded: true
  readonly hostReloaded: boolean
  readonly hostRuntime: 'confirmed' | 'not-confirmed' | 'restart-queued'
  readonly clientReload: 'confirmed' | 'not-observed' | 'restart-queued'
  readonly clientRuntime: 'confirmed' | 'not-observed' | 'restart-queued'
  readonly appWindowsMatched: number
  readonly appWindowsReloaded: number
  readonly appWindowsFailed: number
  readonly appWindowsReloadError?: string
  readonly runtimeRestart: 'not-required' | 'queued-after-turn-flush'
  readonly userActionRequired: 'reopen-app-window' | 'verify-host-runtime' | 'restart-pending' | null
  readonly changedFiles: readonly string[]
  readonly installLog?: string
  readonly buildLog: string
}

/** A validated request to restart the Harness runtime for one Creator-bound App. */
export interface AppRestartResult {
  readonly appId: string
  readonly packageName: string
  readonly restartScheduled: true
}

export type AppInstallSourceKind =
  | 'git-repository'
  | 'remote-zip'
  | 'local-zip'
  | 'local-directory'

export type AppInstallProfileAction = 'install' | 'repair'

export type AppInstallPluginKind = 'app' | 'plugin'

export interface AppInstallPreview {
  readonly previewId: string
  readonly appId: string
  readonly title: string
  readonly pluginKind: AppInstallPluginKind
  readonly packageName: string
  readonly version: string
  readonly sourceKind: AppInstallSourceKind
  /** Repair means the dependency exists but is absent from profile bundles. */
  readonly profileAction: AppInstallProfileAction
  /** Canonical managed repository directory used after installation. */
  readonly sourceDirectory: string
  readonly buildScript: string
  readonly buildMode: 'source-build' | 'prebuilt'
  readonly frozenInstall: boolean
  readonly warnings: readonly string[]
  readonly expiresAt: string
}

export interface AppInstallResult {
  readonly appId: string
  readonly title: string
  readonly pluginKind: AppInstallPluginKind
  readonly packageName: string
  readonly version: string
  readonly sourceDirectory: string
  readonly profileAction: AppInstallProfileAction
  readonly completedAt: string
  readonly installLog: string
  readonly buildLog: string
  readonly packageLog: string
  readonly restartRequired: true
}

/** A generated starter App that has been built and linked into the profile. */
export interface AppCreateResult extends AppInstallResult {
  readonly createdFromTemplate: true
}

export interface AppUninstallResult {
  readonly packageName: string
  readonly sourceDirectory: string
  readonly sourceRetained: true
  readonly packageLog: string
  readonly completedAt: string
  readonly restartRequired: true
}

/** Trusted App identity resolved from a Creator session's source Workspace. */
export interface AppCreatorContext {
  readonly appId: string
  readonly title: string
  readonly packageName: string
  readonly sourcePackageRoot: string
  readonly rebuildAvailable: boolean
  readonly rebuildReason?: string
  readonly applyState: AppPersistedApplyState
}

export interface AppPersistedApplyState {
  readonly status: 'unknown' | 'applied' | 'restart-queued'
  readonly appliedDigest?: string
  readonly pendingRestartDigest?: string
  readonly lastApplyId?: string
  readonly lastAppliedAt?: string
  readonly outputRevision?: string
}

export interface AppCreatorReadyResult {
  readonly protocolVersion: typeof APP_CREATOR_PROTOCOL_VERSION
  readonly sessionId: string
  readonly appId: string
  readonly agentPreset: 'cordis'
  readonly sourcePackageRoot: string
  readonly tools: readonly [
    'deepdeck_app_context',
    'deepdeck_app_apply',
    'deepdeck_app_rebuild',
    'deepdeck_app_restart',
  ]
}

export interface AppWindowReloadReceipt {
  readonly matched: number
  readonly reloaded: number
  readonly failed: number
}

export interface AppConversationWorkspace {
  readonly appId: string
  readonly path: string
  readonly title: string
  readonly workspaceId: string
}

export interface AppConversationHostRegistry {
  register(definition: AppConversationHostDefinition): () => void
  resolve(appId: string): Promise<AppConversationWorkspace>
  resolveCreator(appId: string): Promise<AppConversationWorkspace>
  isCreatorSource(cwd: string): boolean
  creatorContext(cwd: string, signal?: AbortSignal): Promise<AppCreatorContext>
  applyState(cwd: string, signal?: AbortSignal): Promise<AppPersistedApplyState>
  changedFilesSinceApply(
    cwd: string,
    currentFiles: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<readonly string[] | undefined>
  noteClientReady(appId: string): void
  list(signal?: AbortSignal): Promise<readonly AppSettingsDescriptor[]>
  inspectList(signal?: AbortSignal): Promise<readonly AppSettingsDescriptor[]>
  updateContext(appId: string, signal?: AbortSignal): Promise<AppUpdateContext>
  rebuild(appId: string, signal?: AbortSignal): Promise<AppRebuildResult>
  rebuildCreator(cwd: string, signal?: AbortSignal): Promise<AppRebuildResult>
  validateCreator(cwd: string, signal?: AbortSignal): Promise<AppBuildValidationResult>
  restartCreator(cwd: string, signal?: AbortSignal): Promise<AppRestartResult>
  uninstall(appId: string, signal?: AbortSignal): Promise<AppUninstallResult>
}

export interface AppConversationPreparedAction {
  readonly prompt: string
  readonly title: string
  readonly sessionTitle?: string
}

export interface AppConversationClientDefinition {
  readonly id: string
  readonly actions: Readonly<Record<string, (payload: unknown) => AppConversationPreparedAction>>
}

export interface AppConversationClientRegistry {
  register(definition: AppConversationClientDefinition): () => void
}
