/**
 * DeepDeck's provider-aware implementation of the Harness `ctx.web` seam.
 * Search prefers the provider used by the current Agent request, then falls
 * back to another usable search provider. Fetch retains the provider-neutral
 * configured/single-usable selection contract.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import {
  WebError,
  type WebFetchProvider,
  type WebFetchRequest,
  type WebFetchResult,
  type WebSearchProvider,
  type WebSearchRequest,
  type WebSearchResult,
} from '@deepseek-ai/dsh-web'
import z from '@deepseek-ai/schemastery'

export interface ProviderAwareWebConfig {
  /** Explicit search provider id. This deployment override wins over session routing. */
  readonly searchProvider?: string
  /** Explicit fetch provider id. */
  readonly fetchProvider?: string
}

interface ResolvableProvider {
  readonly id: string
  available(): boolean
}

interface Selection<P> {
  readonly configuredId?: string
  readonly providers: ReadonlyMap<string, P>
}

type ResolveModelProvider = () => string | undefined

/** Read the route already committed for the current turn, then fall back to Agent options. */
export function modelProviderForAgent(agent: Agent | undefined): string | undefined {
  return agent?.session.requestHeader()?.config.provider ?? agent?.options.provider
}

/** Map model-provider identity to the matching search-provider identity. */
export function searchProviderForModelProvider(modelProvider: string | undefined): string | undefined {
  return modelProvider
}

/** Resolve one configured provider using the upstream `ctx.web` error contract. */
function resolveProvider<P extends ResolvableProvider>(selection: Selection<P>): P {
  const { configuredId, providers } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (provider === undefined) {
      throw new WebError(
        `configured web provider "${configuredId}" is not registered`,
        'WEB_PROVIDER_CONFIGURED_MISSING',
      )
    }
    if (!provider.available()) {
      throw new WebError(
        `configured web provider "${configuredId}" is registered but unavailable`,
        'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
      )
    }
    return provider
  }

  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new WebError('no usable web provider is registered', 'WEB_PROVIDER_UNAVAILABLE')
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new WebError(
      `multiple usable web providers are registered (${ids}); configure one explicitly`,
      'WEB_PROVIDER_AMBIGUOUS',
    )
  }
  return single
}

/** Put the matching provider first, followed by every other locally usable provider. */
function resolvePreferredProviders<P extends ResolvableProvider>(
  providers: ReadonlyMap<string, P>,
  preferredId: string | undefined,
): readonly P[] {
  const preferred = preferredId === undefined ? undefined : providers.get(preferredId)
  const candidates: P[] = []
  if (preferred?.available() === true) candidates.push(preferred)

  for (const provider of providers.values()) {
    if (provider !== preferred && provider.available()) candidates.push(provider)
  }

  if (candidates.length === 0) {
    throw new WebError('no usable web provider is registered', 'WEB_PROVIDER_UNAVAILABLE')
  }
  return candidates
}

interface SearchOutcome {
  readonly providerIndex: number
  readonly result: WebSearchResult
}

/** Race real searches asynchronously; the first successful provider wins. */
async function searchConcurrently(
  providers: readonly WebSearchProvider[],
  request: WebSearchRequest,
  signal?: AbortSignal,
): Promise<WebSearchResult> {
  signal?.throwIfAborted()
  const controllers = providers.map(() => new AbortController())
  const searches = providers.map((provider, providerIndex) => Promise.resolve()
    .then(() => provider.search(request, controllers[providerIndex]?.signal))
    .then(result => ({ providerIndex, result } satisfies SearchOutcome)))
  const firstSuccess = Promise.any(searches)
  let removeAbortListener: (() => void) | undefined

  try {
    let outcome: SearchOutcome
    if (signal === undefined) {
      outcome = await firstSuccess
    } else {
      const callerAbort = new Promise<never>((_resolve, reject) => {
        const onAbort = (): void => {
          const reason = signal.reason ?? new DOMException('Web search aborted', 'AbortError')
          for (const controller of controllers) controller.abort(reason)
          reject(reason)
        }
        signal.addEventListener('abort', onAbort, { once: true })
        removeAbortListener = () => signal.removeEventListener('abort', onAbort)
      })
      outcome = await Promise.race([firstSuccess, callerAbort])
    }

    const superseded = new DOMException(
      'Another web search provider succeeded',
      'AbortError',
    )
    controllers.forEach((controller, providerIndex) => {
      if (providerIndex !== outcome.providerIndex) controller.abort(superseded)
    })
    return outcome.result
  } catch (error: unknown) {
    if (signal?.aborted === true) throw signal.reason ?? error
    if (!(error instanceof AggregateError)) throw error
    const ids = providers.map(provider => provider.id).join(', ')
    throw new WebError(
      `all usable web search providers failed at runtime (${ids})`,
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  } finally {
    removeAbortListener?.()
  }
}

function capSources(result: WebSearchResult, maxResults: number | undefined): WebSearchResult {
  if (maxResults === undefined || result.sources.length <= maxResults) return result
  return { ...result, sources: result.sources.slice(0, maxResults), truncated: true }
}

/**
 * `ctx.web` service replacement. Explicit config wins. Otherwise search uses
 * the provider whose id matches the current model route first, then races all
 * locally usable providers asynchronously and returns the first real success.
 */
export class ProviderAwareWebRuntime extends Service {
  static Config: z<ProviderAwareWebConfig> = z.object({
    searchProvider: z.string(),
    fetchProvider: z.string(),
  })

  private readonly searchProviders = new Map<string, WebSearchProvider>()
  private readonly fetchProviders = new Map<string, WebFetchProvider>()
  private readonly searchProviderId: string | undefined
  private readonly fetchProviderId: string | undefined
  private readonly resolveModelProvider: ResolveModelProvider

  constructor(
    ctx: Context,
    config: ProviderAwareWebConfig = {},
    resolveModelProvider?: ResolveModelProvider,
  ) {
    super(ctx, 'web')
    this.searchProviderId = config.searchProvider ?? process.env.DSH_WEB_SEARCH_PROVIDER
    this.fetchProviderId = config.fetchProvider ?? process.env.DSH_WEB_FETCH_PROVIDER
    this.resolveModelProvider = resolveModelProvider ?? (() => {
      const agent = ctx.get('agents')?.currentInitiator()
      return modelProviderForAgent(agent)
    })
  }

  registerSearchProvider(provider: WebSearchProvider): () => void {
    return this.registerProvider(this.searchProviders, provider)
  }

  registerFetchProvider(provider: WebFetchProvider): () => void {
    return this.registerProvider(this.fetchProviders, provider)
  }

  private registerProvider<P extends { readonly id: string }>(
    store: Map<string, P>,
    provider: P,
  ): () => void {
    if (store.has(provider.id)) {
      throw new WebError(
        `a web provider with id "${provider.id}" is already registered`,
        'WEB_DUPLICATE_PROVIDER',
      )
    }
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield () => store.delete(provider.id)
    }, 'deepdeck.web.registerProvider()')
    return () => void dispose()
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (this.searchProviderId !== undefined) {
      const provider = resolveProvider({
        providers: this.searchProviders,
        configuredId: this.searchProviderId,
      })
      return capSources(await provider.search(request, signal), request.maxResults)
    }

    const providers = resolvePreferredProviders(
      this.searchProviders,
      searchProviderForModelProvider(this.resolveModelProvider()),
    )
    return capSources(await searchConcurrently(providers, request, signal), request.maxResults)
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const provider = resolveProvider({
      providers: this.fetchProviders,
      ...this.fetchProviderId === undefined ? {} : { configuredId: this.fetchProviderId },
    })
    return provider.fetch(request, signal)
  }
}

export default ProviderAwareWebRuntime
