import {
  APP_CONVERSATION_API_PATH,
  type AppRebuildResult,
  type AppSettingsDescriptor,
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

export async function rebuildApp(appId: string): Promise<AppRebuildResult> {
  const value = await call({ action: 'rebuild', appId })
  if (!isObject(value.rebuild)) throw new Error('App rebuild response is invalid')
  return value.rebuild as unknown as AppRebuildResult
}
