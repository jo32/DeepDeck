import type { ClientRemote, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
// Stable public HTTP contract owned by Codex Connect. Keeping the browser
// helper here avoids importing that plugin's Node host entry into this bundle.
const OPENAI_CODEX_AUTH_STATUS_PATH = '/plugins/dsh-openai-codex/auth/status'
const OPENAI_CODEX_AUTH_LOGIN_PATH = '/plugins/dsh-openai-codex/auth/login'

const POLL_INTERVAL_MS = 750
const LOGIN_TIMEOUT_MS = 5 * 60_000

type AuthStatus =
  | { status: 'signed-out' | 'signing-in' }
  | { status: 'signed-in' }
  | { status: 'reauth-required' | 'error'; message?: string }

interface LoginChallenge { url: string }

async function jsonRequest<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as T
}

function wait(delay: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, delay))
}

async function waitUntilSignedIn(): Promise<void> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await jsonRequest<AuthStatus>(OPENAI_CODEX_AUTH_STATUS_PATH)
    if (state.status === 'signed-in') return
    if (state.status === 'error' || state.status === 'reauth-required') {
      throw new Error(state.message ?? state.status)
    }
    await wait(POLL_INTERVAL_MS)
  }
  throw new Error('ChatGPT sign-in timed out')
}

function firstCodexModel(groups: readonly ModelProviderGroup[]): string | undefined {
  return groups.find(group => group.id === 'openai-codex')?.models[0]?.id
}

async function configureCodex(
  api: Pick<ClientRemote, 'settings' | 'session'>,
): Promise<void> {
  const models = await api.session.modelCatalog()
  if (!models.ok) throw new Error(models.error.message)
  const model = firstCodexModel(models.value.groups)
  if (model === undefined) throw new Error('OpenAI Codex returned no models')

  const search = await api.settings.mutate('llm-openai-codex', [{ op: 'set', path: ['enableSearch'], value: true }], undefined)
  if (!search.ok) throw new Error(search.error.message)

  const selection = await api.settings.mutate('agent-default-model', [
      { op: 'set', path: ['provider'], value: 'openai-codex' },
      { op: 'set', path: ['model'], value: model },
      { op: 'unset', path: ['reasoningEffort'] },
    ], undefined)
  if (!selection.ok) throw new Error(selection.error.message)
}

/** Store the official key and keep the user's chosen provider as the next-session default. */
export async function configureDeepSeek(
  api: Pick<ClientRemote, 'settings' | 'credentials' | 'session'>,
  key: string,
): Promise<void> {
  const stored = await api.credentials.set('DEEPSEEK_API_KEY', key)
  if (!stored.ok) throw new Error(stored.error.message)

  const models = await api.session.modelCatalog()
  if (!models.ok) throw new Error(models.error.message)
  const model = models.value.groups
    .find((group: ModelProviderGroup) => group.id === 'deepseek-official')?.models[0]?.id
  if (model === undefined) throw new Error('DeepSeek returned no models')

  const selection = await api.settings.mutate('agent-default-model', [
      { op: 'set', path: ['provider'], value: 'deepseek-official' },
      { op: 'set', path: ['model'], value: model },
      { op: 'unset', path: ['reasoningEffort'] },
    ], undefined)
  if (!selection.ok) throw new Error(selection.error.message)
}

/** Open Codex Connect's OAuth flow, then make that route ready for first chat/search. */
export async function signInAndConfigureCodex(
  api: Pick<ClientRemote, 'settings' | 'session'>,
): Promise<'popup-blocked' | 'configured'> {
  const popup = window.open('about:blank', '_blank')
  if (popup === null) return 'popup-blocked'
  popup.opener = null
  try {
    const challenge = await jsonRequest<LoginChallenge>(OPENAI_CODEX_AUTH_LOGIN_PATH, 'POST')
    popup.location.replace(challenge.url)
    await waitUntilSignedIn()
    popup.close()
    await configureCodex(api)
    return 'configured'
  } catch (error) {
    popup.close()
    throw error
  }
}
