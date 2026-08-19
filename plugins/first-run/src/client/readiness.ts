import type {
  ConfigurableProviderView,
  CredentialView,
  IApiClient,
  SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'

interface ProviderState {
  entry: ConfigurableProviderView
  apiKeyEnv?: string
  credential?: CredentialView
}

const CODEX_AUTH_STATUS_PATH = '/plugins/dsh-openai-codex/auth/status'

async function codexSignedIn(): Promise<boolean> {
  try {
    const response = await fetch(CODEX_AUTH_STATUS_PATH, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    })
    if (!response.ok) return false
    const value: unknown = await response.json()
    return typeof value === 'object' && value !== null
      && (value as { status?: unknown }).status === 'signed-in'
  } catch {
    return false
  }
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function apiKeyEnvOf(namespace: SettingsNamespaceView | undefined, path: readonly string[]): string | undefined {
  const profile = namespace === undefined ? undefined : valueAt(namespace.value, path)
  if (typeof profile !== 'object' || profile === null) return undefined
  const ref = (profile as { apiKeyEnv?: unknown }).apiKeyEnv
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

/** True when at least one live provider has every credential it declares. */
export async function hasUsableModelProvider(
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>,
): Promise<boolean> {
  const [providersResponse, settingsResponse] = await Promise.all([
    api.llm.providers({}),
    api.settings.describe({}),
  ])
  if (!providersResponse.result.ok || !settingsResponse.result.ok) return true
  const namespaces = new Map(
    settingsResponse.result.value.namespaces.map((namespace: SettingsNamespaceView) => [namespace.ns, namespace]),
  )
  const providers: ProviderState[] = providersResponse.result.value.providers.map((entry: ConfigurableProviderView) => ({
    entry,
    apiKeyEnv: apiKeyEnvOf(namespaces.get(entry.settingsNs), entry.settingsPath),
  }))
  const refs = [...new Set(providers.flatMap(provider => provider.apiKeyEnv === undefined ? [] : [provider.apiKeyEnv]))]
  let credentials: Record<string, CredentialView> = {}
  if (refs.length > 0) {
    const response = await api.credentials.describe({ refs })
    if (!response.result.ok) return true
    credentials = response.result.value.credentials
  }
  const usableWithoutCodex = providers.some(provider => provider.entry.provider !== 'openai-codex'
    && provider.entry.active && (
    provider.apiKeyEnv === undefined || credentials[provider.apiKeyEnv]?.configured === true
  ))
  if (usableWithoutCodex) return true
  const codex = providers.find(provider => provider.entry.provider === 'openai-codex')
  return codex?.entry.active === true && await codexSignedIn()
}
