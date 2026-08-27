import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, type Agent } from '@deepseek-ai/dsh-agent'
import type {
  WebFetchProvider,
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
} from '@deepseek-ai/dsh-web'
import {
  modelProviderForAgent,
  ProviderAwareWebRuntime,
  searchProviderForModelProvider,
} from './index.ts'

function result(content: string, sources: WebSearchResult['sources'] = []): WebSearchResult {
  return { content, sources, truncated: false }
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

  it('does not fall through to DeepSeek when the OpenAI provider is missing', async () => {
    const { web } = await mount('openai-codex')
    web.registerSearchProvider(searchProvider('deepseek-official'))

    await expect(web.search({ query: 'news' })).rejects.toThrow(expect.objectContaining({
      code: 'WEB_PROVIDER_CONFIGURED_MISSING',
    }))
  })

  it('keeps explicit deployment configuration above model routing', async () => {
    const { web } = await mount('openai-codex', { searchProvider: 'deepseek-official' })
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex'))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('retains the single-usable-provider fallback for unknown model routes', async () => {
    const { web } = await mount('custom-model-provider')
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex', false))

    await expect(web.search({ query: 'news' })).resolves.toMatchObject({
      content: 'deepseek-official:news',
    })
  })

  it('retains ambiguity errors outside a known model route', async () => {
    const { web } = await mount(undefined)
    web.registerSearchProvider(searchProvider('deepseek-official'))
    web.registerSearchProvider(searchProvider('openai-codex'))

    await expect(web.search({ query: 'news' })).rejects.toThrow(expect.objectContaining({
      code: 'WEB_PROVIDER_AMBIGUOUS',
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
})
