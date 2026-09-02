import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, type Agent } from '@deepseek-ai/dsh-agent'
import {
  WebError,
  type WebFetchProvider,
  type WebSearchProvider,
  type WebSearchRequest,
  type WebSearchResult,
} from '@deepseek-ai/dsh-web'
import {
  modelProviderForAgent,
  ProviderAwareWebRuntime,
  searchProviderForModelProvider,
} from './index.ts'

function result(content: string, sources: WebSearchResult['sources'] = []): WebSearchResult {
  return { content, sources, truncated: false }
}

type SearchImplementation = WebSearchProvider['search']

/** Exercise the same runtime search contract as concrete provider plugins. */
function runtimeSearchProvider(
  id: string,
  search: SearchImplementation,
  usable = true,
): WebSearchProvider {
  return { id, available: () => usable, search }
}

function searchProvider(id: string, usable = true): WebSearchProvider {
  return {
    id,
    available: () => usable,
    search: vi.fn((request: WebSearchRequest) => Promise.resolve(result(`${id}:${request.query}`))),
  }
}

async function mount(
  modelProvider: string | undefined,
  config: ConstructorParameters<typeof ProviderAwareWebRuntime>[1] = {},
): Promise<{ ctx: Context; web: ProviderAwareWebRuntime }> {
  const ctx = new Context()
  const web = new ProviderAwareWebRuntime(ctx, config, () => modelProvider)
  return { ctx, web }
}

describe('model-aware search routing', () => {
  it('routes a ChatGPT-backed Agent to OpenAI when DeepSeek is also usable', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'openai-codex:news',
    })
  })

  it('routes a DeepSeek-backed Agent to DeepSeek when OpenAI is also usable', async () => {
    const { web } = await mount('deepseek-official')
    web.registerSearchProvider(searchProvider('openai-codex'))
    web.registerSearchProvider(searchProvider('deepseek-official'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('falls back to a usable provider when the matching provider is missing', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider(searchProvider('deepseek-official'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('falls back to a usable provider when the matching provider is unavailable', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider(searchProvider('openai-codex', false))
    web.registerSearchProvider(searchProvider('deepseek-official'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('schedules the matching provider first and falls back when its real search fails', async () => {
    const { web } = await mount('openai-codex')
    const calls: string[] = []
    const matchingSearch = vi.fn(() => {
      calls.push('openai-codex')
      return Promise.reject(new WebError('OpenAI is temporarily offline', 'WEB_PROVIDER_ERROR'))
    })
    const fallbackSearch = vi.fn((request: WebSearchRequest) => {
      calls.push('deepseek-official')
      return Promise.resolve(result(`deepseek-official:${request.query}`))
    })
    web.registerSearchProvider(runtimeSearchProvider('deepseek-official', fallbackSearch))
    web.registerSearchProvider(runtimeSearchProvider('openai-codex', matchingSearch))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
    expect(calls).toEqual(['openai-codex', 'deepseek-official'])
    expect(matchingSearch).toHaveBeenCalledTimes(1)
    expect(fallbackSearch).toHaveBeenCalledTimes(1)
  })

  it('runs runtime candidates concurrently and returns the first success', async () => {
    const { web } = await mount(undefined)
    const firstSearch = vi.fn(() => Promise.reject(new Error('first failed')))
    const secondSearch = vi.fn(() => Promise.reject(new Error('second failed')))
    const thirdSearch = vi.fn(() => Promise.resolve(result('third:news')))
    web.registerSearchProvider(runtimeSearchProvider('first', firstSearch))
    web.registerSearchProvider(runtimeSearchProvider('second', secondSearch))
    web.registerSearchProvider(runtimeSearchProvider('third', thirdSearch))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({ content: 'third:news' })
    expect(firstSearch).toHaveBeenCalledTimes(1)
    expect(secondSearch).toHaveBeenCalledTimes(1)
    expect(thirdSearch).toHaveBeenCalledTimes(1)
  })

  it('does not wait for a slow matching provider after a fallback succeeds', async () => {
    const { web } = await mount('openai-codex')
    const matchingSearch = vi.fn((_request: WebSearchRequest, signal?: AbortSignal) => new Promise<WebSearchResult>(
      (_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }),
    ))
    const fallbackSearch = vi.fn(() => Promise.resolve(result('fallback:news')))
    web.registerSearchProvider(runtimeSearchProvider('openai-codex', matchingSearch))
    web.registerSearchProvider(runtimeSearchProvider('deepseek-official', fallbackSearch))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({ content: 'fallback:news' })
    expect(matchingSearch).toHaveBeenCalledTimes(1)
    expect(fallbackSearch).toHaveBeenCalledTimes(1)
  })

  it('continues when one provider reports its own cancellation', async () => {
    const { web } = await mount('openai-codex')
    const aborted = new WebError('search aborted', 'WEB_ABORTED')
    const matchingSearch = vi.fn(() => Promise.reject(aborted))
    const fallbackSearch = vi.fn(() => Promise.resolve(result('fallback:news')))
    web.registerSearchProvider(runtimeSearchProvider('openai-codex', matchingSearch))
    web.registerSearchProvider(runtimeSearchProvider('deepseek-official', fallbackSearch))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({ content: 'fallback:news' })
    expect(fallbackSearch).toHaveBeenCalledTimes(1)
  })

  it('caller cancellation stops every in-flight provider', async () => {
    const { web } = await mount('openai-codex')
    const waitForAbort = vi.fn((_request: WebSearchRequest, signal?: AbortSignal) => {
      if (signal?.aborted === true) return Promise.reject(signal.reason)
      return new Promise<WebSearchResult>(
        (_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }),
      )
    })
    web.registerSearchProvider(runtimeSearchProvider('openai-codex', waitForAbort))
    web.registerSearchProvider(runtimeSearchProvider('deepseek-official', waitForAbort))
    const controller = new AbortController()
    const reason = new DOMException('user cancelled', 'AbortError')

    const pending = web.search({ query: 'news' }, controller.signal)
    controller.abort(reason)

    await expect(pending).rejects.toBe(reason)
    expect(waitForAbort).toHaveBeenCalledTimes(2)
  })

  it('reports every attempted provider when all runtime searches fail', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider(runtimeSearchProvider(
      'openai-codex',
      () => Promise.reject(new Error('OpenAI failed')),
    ))
    web.registerSearchProvider(runtimeSearchProvider(
      'deepseek-official',
      () => Promise.reject(new Error('DeepSeek failed')),
    ))

    await expect(web.search({ query: 'news' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: 'all usable web search providers failed at runtime (openai-codex, deepseek-official)',
      cause: expect.any(AggregateError),
    })
  })

  it('keeps explicit deployment configuration above model routing', async () => {
    const { web } = await mount('openai-codex', { searchProvider: 'deepseek-official' })
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('keeps an unavailable explicit deployment configuration strict', async () => {
    const { web } = await mount('openai-codex', { searchProvider: 'deepseek-official' })
    web.registerSearchProvider(searchProvider('deepseek-official', false))
    web.registerSearchProvider(searchProvider('openai-codex'))

    await expect(web.search({ query: 'news' })).rejects.toThrow(expect.objectContaining({
      code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
    }))
  })

  it('matches newly registered provider ids without a hard-coded allowlist', async () => {
    const { web } = await mount('custom-model-provider')
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('custom-model-provider'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'custom-model-provider:news',
    })
  })

  it('automatically chooses a usable provider when no model route is available', async () => {
    const { web } = await mount(undefined)
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('reports unavailable only when no search provider can run', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider(searchProvider('openai-codex', false))
    web.registerSearchProvider(searchProvider('deepseek-official', false))

    await expect(web.search({ query: 'news' })).rejects.toThrow(expect.objectContaining({
      code: 'WEB_PROVIDER_UNAVAILABLE',
    }))
  })
})

describe('route and seam compatibility', () => {
  it('reads the provider from the real Agent initiator boundary', async () => {
    const ctx = new Context()
    const web = new ProviderAwareWebRuntime(ctx)
    await ctx.plugin(AgentRegistry)
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex'))
    const agent = {
      options: { provider: 'deepseek-official' },
      session: {
        requestHeader: () => ({ config: { provider: 'openai-codex' } }),
      },
    } as unknown as Agent

    await expect(ctx.agents.withInitiator(
      agent,
      () => web.search({ query: 'news' }),
    )).resolves.toMatchObject({ content: 'openai-codex:news' })
  })

  it('prefers the latest request header over Agent creation options', () => {
    const agent = {
      options: { provider: 'deepseek-official' },
      session: {
        requestHeader: () => ({ config: { provider: 'openai-codex' } }),
      },
    } as unknown as Agent

    expect(modelProviderForAgent(agent)).toBe('openai-codex')
    expect(searchProviderForModelProvider('openai-codex')).toBe('openai-codex')
  })

  it('caps sources after the selected provider returns', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider({
      id: 'openai-codex',
      available: () => true,
      search: () => Promise.resolve(result('answer', [
        { url: 'https://one.example' },
        { url: 'https://two.example' },
      ])),
    })

    await expect(web.search({ query: 'news', maxResults: 1 })).resolves.toMatchObject({
      sources: [{ url: 'https://one.example' }],
      truncated: true,
    })
  })

  it('keeps fetch selection independent from the model provider', async () => {
    const { web } = await mount('openai-codex')
    const provider: WebFetchProvider = {
      id: 'http',
      available: () => true,
      fetch: () => Promise.resolve({
        url: 'https://example.com',
        statusCode: 200,
        body: { kind: 'text', content: 'ok' },
        truncated: false,
      }),
    }
    web.registerFetchProvider(provider)

    await expect(web.fetch({ url: 'https://example.com' })).resolves.toMatchObject({
      statusCode: 200,
    })
  })

  it('keeps the existing ambiguity contract for multiple usable fetch providers', async () => {
    const { web } = await mount('openai-codex')
    const provider = (id: string): WebFetchProvider => ({
      id,
      available: () => true,
      fetch: () => Promise.resolve({
        url: 'https://example.com',
        statusCode: 200,
        body: { kind: 'text', content: id },
        truncated: false,
      }),
    })
    web.registerFetchProvider(provider('first'))
    web.registerFetchProvider(provider('second'))

    await expect(web.fetch({ url: 'https://example.com' })).rejects.toThrow(
      expect.objectContaining({ code: 'WEB_PROVIDER_AMBIGUOUS' }),
    )
  })
})
