import { describe, expect, it, vi } from 'vitest'
import { DshfindAppMarket, emptyAppMarketInventory } from './app-market.js'

function catalogResponse(items: readonly unknown[], page: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    schemaVersion: '1.0.0',
    items,
    page,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function catalogItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'github:fixture/reader',
    name: 'reader',
    displayName: 'Fixture Reader',
    summary: 'Read local fixtures from a DSH plugin.',
    description: 'A fixture description.',
    latestVersion: '1.2.3',
    license: 'MIT',
    categories: ['productivity'],
    keywords: ['reader'],
    repository: {
      url: 'https://github.com/fixture/reader',
      subdirectory: 'packages/plugin',
    },
    package: { registry: 'npm', name: '@fixture/reader' },
    publisher: { name: 'Fixture Labs' },
    updatedAt: '2026-08-26T12:00:00Z',
    ...overrides,
  }
}

describe('DshfindAppMarket', () => {
  it('queries the reviewed endpoint, normalizes rows, and reconciles installed packages', async () => {
    const fetchValue = vi.fn(async () => catalogResponse(
      [catalogItem()],
      { nextCursor: 'next-page', total: 42 },
    ))
    const market = new DshfindAppMarket({ fetchValue: fetchValue as unknown as typeof fetch })

    const page = await market.list('reader', 'cursor-1', {
      catalogItemIds: new Set(),
      packageNames: new Set(['@fixture/reader']),
      repositoryUrls: new Set(),
    })

    expect(fetchValue).toHaveBeenCalledOnce()
    const requested = fetchValue.mock.calls[0]?.[0]
    expect(requested).toBeInstanceOf(URL)
    expect(String(requested)).toBe('https://api.dshfind.com/market/v1/plugins?limit=24&q=reader&cursor=cursor-1')
    expect(page).toMatchObject({ nextCursor: 'next-page', total: 42 })
    expect(page.items).toEqual([expect.objectContaining({
      id: 'github:fixture/reader',
      packageName: '@fixture/reader',
      installed: true,
      repository: {
        url: 'https://github.com/fixture/reader',
        subdirectory: 'packages/plugin',
      },
    })])
  })

  it('drops unsafe catalog rows and refuses redirects', async () => {
    const unsafe = catalogItem({
      id: 'unsafe row',
      repository: { url: 'https://evil.example/plugin' },
    })
    const market = new DshfindAppMarket({
      fetchValue: vi.fn(async () => catalogResponse([unsafe])) as unknown as typeof fetch,
    })
    await expect(market.list('', undefined, emptyAppMarketInventory())).resolves.toEqual({ items: [] })

    const redirected = new DshfindAppMarket({
      fetchValue: vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/catalog' },
      })) as unknown as typeof fetch,
    })
    await expect(redirected.list('', undefined, emptyAppMarketInventory())).rejects.toThrow('redirected')
  })

  it('resolves install metadata only from a previously validated catalog row', async () => {
    const fetchValue = vi.fn(async () => catalogResponse([catalogItem()]))
    const market = new DshfindAppMarket({ fetchValue: fetchValue as unknown as typeof fetch })
    await market.list('', undefined, emptyAppMarketInventory())

    await expect(market.resolve('github:fixture/reader')).resolves.toMatchObject({
      id: 'github:fixture/reader',
      repository: { url: 'https://github.com/fixture/reader' },
    })
    expect(fetchValue).toHaveBeenCalledOnce()
  })
})
