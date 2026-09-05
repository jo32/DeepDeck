import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserSiteStore, siteId, siteOrigin } from './site-store.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
describe('browser site identity and recovery', () => {
  it('reuses origin identity across paths but separates schemes, ports and hosts', () => {
    expect(siteId('https://example.com/a')).toBe(siteId('https://example.com/b'))
    expect(siteId('https://example.com')).not.toBe(siteId('http://example.com'))
    expect(siteId('https://example.com:444')).not.toBe(siteId('https://example.com'))
    expect(() => siteOrigin('file:///etc/passwd')).toThrow()
    expect(() => siteOrigin('https://user:password@example.com')).toThrow()
  })
  it('restores same Agent and mode without reviving an obsolete native tab', async () => {
    const root = await mkdtemp(join(tmpdir(), 'browser-sites-')); roots.push(root)
    const store = new BrowserSiteStore(root)
    const first = await store.ensure('https://example.com/a')
    await store.update(first.id, { sessionId: 'agent-one', tabId: 'old-tab', mode: 'builder' })
    const restored = new BrowserSiteStore(root); await restored.ready
    const second = await restored.ensure('https://example.com/b')
    expect(second).toMatchObject({ id: first.id, sessionId: 'agent-one', mode: 'builder' })
    expect(second.tabId).toBeUndefined()
  })
})
