import type { IApiClient, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
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
  api: Pick<IApiClient, 'settings' | 'llm'>,
): Promise<void> {
  const models = await api.llm.models({})
  if (!models.result.ok) throw new Error(models.result.error.message)
  const model = firstCodexModel(models.result.value.groups)
  if (model === undefined) throw new Error('OpenAI Codex returned no models')

  const search = await api.settings.mutate({
    ns: 'llm-openai-codex',
    ops: [{ op: 'set', path: ['enableSearch'], value: true }],
  })
  if (!search.result.ok) throw new Error(search.result.error.message)

  const selection = await api.settings.mutate({
    ns: 'agent-default-model',
    ops: [
      { op: 'set', path: ['provider'], value: 'openai-codex' },
      { op: 'set', path: ['model'], value: model },
      { op: 'unset', path: ['reasoningEffort'] },
    ],
  })
  if (!selection.result.ok) throw new Error(selection.result.error.message)
}

/** Store the official key and keep the user's chosen provider as the next-session default. */
export async function configureDeepSeek(
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>,
  key: string,
): Promise<void> {
  const stored = await api.credentials.set({ ref: 'DEEPSEEK_API_KEY', value: key })
  if (!stored.result.ok) throw new Error(stored.result.error.message)

  const models = await api.llm.models({})
  if (!models.result.ok) throw new Error(models.result.error.message)
  const model = models.result.value.groups
    .find((group: ModelProviderGroup) => group.id === 'deepseek-official')?.models[0]?.id
  if (model === undefined) throw new Error('DeepSeek returned no models')

  const selection = await api.settings.mutate({
    ns: 'agent-default-model',
    ops: [
      { op: 'set', path: ['provider'], value: 'deepseek-official' },
      { op: 'set', path: ['model'], value: model },
      { op: 'unset', path: ['reasoningEffort'] },
    ],
  })
  if (!selection.result.ok) throw new Error(selection.result.error.message)
}

/** Open Codex Connect's OAuth flow, then make that route ready for first chat/search. */
export async function signInAndConfigureCodex(
  api: Pick<IApiClient, 'settings' | 'llm'>,
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
