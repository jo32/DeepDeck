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
}

export interface AppSettingsDescriptor {
  readonly id: string
  readonly title: string
  readonly packageName: string
  readonly rebuildAvailable: boolean
  readonly rebuildReason?: string
}

export interface AppRebuildResult {
  readonly appId: string
  readonly packageName: string
  readonly completedAt: string
  readonly durationMs: number
  readonly hostReloaded: boolean
  readonly buildLog: string
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
  rebuild(appId: string, signal?: AbortSignal): Promise<AppRebuildResult>
  rebuildCreator(cwd: string, signal?: AbortSignal): Promise<AppRebuildResult>
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
