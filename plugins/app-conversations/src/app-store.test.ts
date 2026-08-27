import { describe, expect, it, vi } from 'vitest'
import { emptyAppMarketInventory } from './app-market.js'
import { DeepDeckAppStore } from './app-store.js'

function searchResponse(items: readonly unknown[], total = items.length): Response {
  return new Response(JSON.stringify({ total_count: total, incomplete_results: false, items }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function manifestResponse(overrides: Record<string, unknown> = {}): Response {
  const manifest = {
    name: 'dsh-nga-reader-plugin',
    version: '0.1.3',
    dsh: { app: { id: 'nga-reader', title: 'NGA Reader' } },
    ...overrides,
  }
  return new Response(JSON.stringify({
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(manifest)).toString('base64'),
  }), { headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function repository(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    full_name: 'jo32/dsh-nga-reader',
    name: 'dsh-nga-reader',
    html_url: 'https://github.com/jo32/dsh-nga-reader',
    description: 'A dsh-plugin NGA reader with app-scoped conversations.',
    homepage: null,
    archived: false,
    disabled: false,
    topics: ['cordis-plugin', 'deepdeck', 'deepseek-harness', 'dsh-plugin', 'nga-reader'],
    owner: { login: 'jo32' },
    license: { spdx_id: 'MIT' },
    updated_at: '2026-08-25T07:39:30Z',
    default_branch: 'main',
    ...overrides,
  }
}

describe('DeepDeckAppStore', () => {
  it('queries the deepdeck topic and normalizes repositories with a dsh.app manifest', async () => {
    const fetchValue = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return url.pathname === '/search/repositories'
        ? searchResponse([repository()], 25)
        : manifestResponse()
    })
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    const page = await store.list('reader', undefined, emptyAppMarketInventory())

    const requested = fetchValue.mock.calls[0]?.[0]
    expect(requested).toBeInstanceOf(URL)
    const url = requested as URL
    expect(url.origin + url.pathname).toBe('https://api.github.com/search/repositories')
    expect(url.searchParams.get('q')).toBe('topic:deepdeck "reader"')
    expect(page).toMatchObject({ nextCursor: '2' })
    expect(page.items).toEqual([expect.objectContaining({
      id: 'github:jo32/dsh-nga-reader',
      displayName: 'NGA Reader',
      packageName: 'dsh-nga-reader-plugin',
      latestVersion: '0.1.3',
      installed: false,
      categories: expect.arrayContaining(['deepdeck', 'dsh-plugin']),
      repository: { url: 'https://github.com/jo32/dsh-nga-reader' },
    })])
  })

  it('fails closed when a repository does not carry the deepdeck topic', async () => {
    const fetchValue = vi.fn(async () => searchResponse([
      repository({ topics: ['dsh-plugin'] }),
    ]))
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    await expect(store.list('', undefined, emptyAppMarketInventory())).resolves.toEqual({
      items: [],
      total: 0,
    })
  })

  it('reconciles an installed App by canonical repository URL', async () => {
    const store = new DeepDeckAppStore({
      fetchValue: vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input))
        return url.pathname === '/search/repositories' ? searchResponse([repository()]) : manifestResponse()
      }) as unknown as typeof fetch,
    })

    const page = await store.list('', undefined, {
      catalogItemIds: new Set(),
      packageNames: new Set(),
      repositoryUrls: new Set(['https://github.com/jo32/dsh-nga-reader']),
    })

    expect(page.items[0]?.installed).toBe(true)
  })

  it('excludes the DeepDeck host repository even if it carries a dsh.app manifest', async () => {
    const fetchValue = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return url.pathname === '/search/repositories'
        ? searchResponse([repository({
            full_name: 'jo32/DeepDeck',
            name: 'DeepDeck',
            html_url: 'https://github.com/jo32/DeepDeck',
          })])
        : manifestResponse({ name: 'deepdeck', dsh: { app: { id: 'deepdeck', title: 'DeepDeck' } } })
    })
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    await expect(store.list('', undefined, emptyAppMarketInventory())).resolves.toEqual({
      items: [],
      total: 0,
    })
    expect(fetchValue).toHaveBeenCalledTimes(1)
  })
})
