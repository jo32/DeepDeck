import {
  APP_CONVERSATION_API_PATH,
  type AppCreateResult,
  type AppInstallPreview,
  type AppInstallResult,
  type AppRebuildResult,
  type AppSettingsDescriptor,
  type AppUninstallResult,
  type AppUpdateContext,
} from '../contracts.js'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function call(body: JsonObject): Promise<JsonObject> {
  const response = await fetch(APP_CONVERSATION_API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const value: unknown = await response.json()
  if (!response.ok || !isObject(value)) {
    const message = isObject(value) && typeof value.error === 'string'
      ? value.error
      : `HTTP ${String(response.status)}`
    throw new Error(message)
  }
  return value
}

export async function listApps(): Promise<readonly AppSettingsDescriptor[]> {
  const value = await call({ action: 'list-apps' })
  if (!Array.isArray(value.apps)) throw new Error('Apps response is invalid')
  return value.apps as AppSettingsDescriptor[]
}

export async function createApp(appId: string, title: string): Promise<AppCreateResult> {
  const value = await call({ action: 'create-app', appId, title })
  if (!isObject(value.created)) throw new Error('App creation response is invalid')
  return value.created as unknown as AppCreateResult
}

export async function rebuildApp(appId: string): Promise<AppRebuildResult> {
  const value = await call({ action: 'rebuild', appId })
  if (!isObject(value.rebuild)) throw new Error('App rebuild response is invalid')
  return value.rebuild as unknown as AppRebuildResult
}

export async function previewAppInstall(source: string): Promise<AppInstallPreview> {
  const value = await call({ action: 'preview-install', source })
  if (!isObject(value.installPreview)) throw new Error('App install preview response is invalid')
  return value.installPreview as unknown as AppInstallPreview
}

export async function installApp(previewId: string): Promise<AppInstallResult> {
  const value = await call({ action: 'install', previewId })
  if (!isObject(value.install)) throw new Error('App install response is invalid')
  return value.install as unknown as AppInstallResult
}

export async function discardAppInstall(previewId: string): Promise<void> {
  await call({ action: 'discard-install', previewId })
}

export async function uninstallApp(appId: string): Promise<AppUninstallResult> {
  const value = await call({ action: 'uninstall', appId })
  if (!isObject(value.uninstall)) throw new Error('App uninstall response is invalid')
  return value.uninstall as unknown as AppUninstallResult
}

export async function resolveAppUpdateContext(appId: string): Promise<AppUpdateContext> {
  const value = await call({ action: 'resolve-update-context', appId })
  if (!isObject(value.updateContext)) throw new Error('App update context response is invalid')
  return value.updateContext as unknown as AppUpdateContext
}

export async function restartForApps(): Promise<void> {
  await call({ action: 'restart' })
}
