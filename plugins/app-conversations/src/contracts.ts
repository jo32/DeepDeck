export const APP_CONVERSATION_API_PATH = '/api/deepdeck/app-conversations'
export const APP_CONVERSATION_CHANNEL = 'deepdeck-app-conversations-v1'
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
  readonly completedAt: string
  readonly durationMs: number
  readonly hostReloaded: boolean
  /** Client replacement is asynchronous and is not acknowledged by the Harness client. */
  readonly clientReload: 'not-observed'
  /** Secondary App windows that completed a reload against the new Host output. */
  readonly appWindowsReloaded: number
  readonly appWindowsReloadError?: string
  readonly buildLog: string
}

/** A reviewed in-place build that intentionally waits for a full runtime restart. */
export interface AppBuildValidationResult {
  readonly appId: string
  readonly packageName: string
  readonly completedAt: string
  readonly durationMs: number
  readonly installLog: string
  readonly buildLog: string
}

/** One authoritative Creator apply outcome. */
export interface AppApplyResult {
  readonly appId: string
  readonly packageName: string
  readonly completedAt: string
  readonly durationMs: number
  readonly outcome: 'hot-reloaded' | 'restart-queued'
  readonly buildSucceeded: true
  readonly hostReloaded: boolean
  readonly clientReload: 'not-observed' | 'restart-queued'
  readonly appWindowsReloaded: number
  readonly appWindowsReloadError?: string
  readonly runtimeRestart: 'not-required' | 'queued-after-turn-flush'
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

export interface AppInstallPreview {
  readonly previewId: string
  readonly appId: string
  readonly title: string
  readonly packageName: string
  readonly version: string
  readonly sourceKind: AppInstallSourceKind
  /** Repair means the dependency exists but is absent from profile bundles. */
  readonly profileAction: AppInstallProfileAction
  /** Canonical managed repository directory used after installation. */
  readonly sourceDirectory: string
  readonly buildScript: string
  readonly frozenInstall: boolean
  readonly warnings: readonly string[]
  readonly expiresAt: string
}

export interface AppInstallResult {
  readonly appId: string
  readonly title: string
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
  creatorContext(cwd: string, signal?: AbortSignal): Promise<AppCreatorContext>
  list(signal?: AbortSignal): Promise<readonly AppSettingsDescriptor[]>
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
