import { describe, expect, it, vi } from 'vitest'
import { emptyAppMarketInventory } from './app-market.js'
import { DeepDeckAppStore } from './app-store.js'

function catalogResponse(items: readonly unknown[], page: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    schemaVersion: '1.0.0',
    items,
    page,
  }), { headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function manifestResponse(overrides: Record<string, unknown> = {}): Response {
  const manifest = {
    name: 'dsh-nga-reader-plugin',
    version: '0.1.3',
    dsh: { app: { id: 'nga-reader', title: 'NGA Reader' } },
    ...overrides,
  }
  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

function catalogItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'jo32/dsh-nga-reader',
    name: 'dsh-nga-reader',
    displayName: 'dsh-nga-reader',
    summary: 'A dsh-plugin NGA reader with app-scoped AI conversations for DeepDeck.',
    repository: { url: 'https://github.com/jo32/dsh-nga-reader' },
    publisher: { name: 'jo32' },
    updatedAt: '2026-08-25T07:39:30Z',
    ...overrides,
  }
}

describe('DeepDeckAppStore', () => {
  it('searches dshfind and validates dsh.app through raw repository content', async () => {
    const fetchValue = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return url.hostname === 'api.dshfind.com'
        ? catalogResponse([catalogItem()], { nextCursor: 'next-page', total: 25 })
        : manifestResponse()
    })
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    const page = await store.list('reader', undefined, emptyAppMarketInventory())

    const searchUrl = fetchValue.mock.calls[0]?.[0] as URL
    expect(searchUrl.origin + searchUrl.pathname).toBe('https://api.dshfind.com/market/v1/plugins')
    expect(searchUrl.searchParams.get('q')).toBe('reader')
    expect(searchUrl.searchParams.get('limit')).toBe('24')
    const manifestUrl = fetchValue.mock.calls[1]?.[0] as URL
    expect(String(manifestUrl)).toBe('https://raw.githubusercontent.com/jo32/dsh-nga-reader/HEAD/package.json')
    expect(fetchValue.mock.calls.every(call => new URL(String(call[0])).hostname !== 'api.github.com')).toBe(true)
    expect(page).toMatchObject({ nextCursor: 'next-page' })
    expect(page.items).toEqual([expect.objectContaining({
      id: 'jo32/dsh-nga-reader',
      displayName: 'NGA Reader',
      packageName: 'dsh-nga-reader-plugin',
      latestVersion: '0.1.3',
      installed: false,
      repository: { url: 'https://github.com/jo32/dsh-nga-reader' },
    })])
    expect(store.resolve('jo32/dsh-nga-reader')).toBe(page.items[0])
  })

  it('uses the deepdeck discovery query for the initial App listing', async () => {
    const fetchValue = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return url.hostname === 'api.dshfind.com'
        ? catalogResponse([catalogItem()], { total: 1 })
        : manifestResponse()
    })
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    await expect(store.list('', undefined, emptyAppMarketInventory())).resolves.toMatchObject({ total: 1 })

    const searchUrl = fetchValue.mock.calls[0]?.[0] as URL
    expect(searchUrl.searchParams.get('q')).toBe('deepdeck')
  })

  it('fails closed when a dshfind result does not declare dsh.app', async () => {
    const fetchValue = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return url.hostname === 'api.dshfind.com'
        ? catalogResponse([catalogItem()], { total: 1 })
        : manifestResponse({ dsh: { bundle: { patch: './cordis.patch.yml' } } })
    })
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    await expect(store.list('', undefined, emptyAppMarketInventory())).resolves.toEqual({
      items: [],
      total: 0,
    })
  })

  it('reads a catalog package subdirectory and reconciles the validated package name', async () => {
    const fetchValue = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return url.hostname === 'api.dshfind.com'
        ? catalogResponse([catalogItem({
            repository: {
              url: 'https://github.com/jo32/dsh-nga-reader',
              subdirectory: 'packages/reader',
            },
          })], { total: 1 })
        : manifestResponse()
    })
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    const page = await store.list('', undefined, {
      catalogItemIds: new Set(),
      packageNames: new Set(['dsh-nga-reader-plugin']),
      repositoryUrls: new Set(),
    })

    expect(String(fetchValue.mock.calls[1]?.[0])).toBe(
      'https://raw.githubusercontent.com/jo32/dsh-nga-reader/HEAD/packages/reader/package.json',
    )
    expect(page.items[0]?.installed).toBe(true)
  })

  it('excludes the DeepDeck host repository without requesting its manifest', async () => {
    const fetchValue = vi.fn(async () => catalogResponse([catalogItem({
      id: 'jo32/DeepDeck',
      name: 'DeepDeck',
      repository: { url: 'https://github.com/jo32/DeepDeck' },
    })], { total: 1 }))
    const store = new DeepDeckAppStore({ fetchValue: fetchValue as unknown as typeof fetch })

    await expect(store.list('', undefined, emptyAppMarketInventory())).resolves.toEqual({
      items: [],
      total: 0,
    })
    expect(fetchValue).toHaveBeenCalledTimes(1)
  })
})
