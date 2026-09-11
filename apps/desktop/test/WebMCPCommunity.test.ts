// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { WebMCPCommunity } from '../../../plugins/browser/src/client/WebMCPCommunity.js'
import { WebMCPDirectory } from '../../../plugins/browser/src/client/WebMCPDirectory.tsx'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined; let container: HTMLDivElement
afterEach(async () => { await act(async () => { root?.unmount() }); container?.remove() })
function mount() { container = document.createElement('div'); document.body.append(container); root = createRoot(container) }
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent) === text)
  expect(button, text).toBeDefined()
  await act(async () => { button!.click() })
}
it('opens source preview without installing, then sends only the confirmed token', async () => {
  const preview = { token: 'preview-1', source: 'const source = "review me";', hasDraft: true, previousRevision: 'old', manifest: { name: 'Articles', version: '1.0.0', description: 'Read articles', origin: 'https://example.com', license: 'MIT', tools: [] }, provenance: { repository: 'https://github.com/test/webmcp', commit: 'a'.repeat(40), release: 'v1.0.0' } }
  const request = vi.fn(async (input: any) => input.action === 'market.preview' ? preview : input.action === 'market.catalog' ? { formatVersion: 1, entries: [], generatedAt: null } : {})
  const refresh = vi.fn(async () => {})
  const props = { site: { id: 'site', origin: 'https://example.com', provenance: { repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', commit: 'b'.repeat(40), repositoryId: 1, version: '0.9.0' } }, browser: { request }, running: false, refresh, t: (key: keyof typeof en) => en[key] } as unknown as ComponentProps<typeof WebMCPCommunity>
  mount(); await act(async () => { root!.render(createElement(WebMCPCommunity, props)) })
  await click('Preview latest release')
  expect(request.mock.calls.filter(([input]) => input.action === 'market.install')).toHaveLength(0)
  expect(container.textContent).toContain('review me')
  expect(container.textContent).toContain('existing Builder draft is preserved')
  await click('Replace active tools')
  expect(request).toHaveBeenCalledWith({ action: 'market.install', siteId: 'site', token: 'preview-1' })
  expect(refresh).toHaveBeenCalledOnce()
  expect(container.textContent).toContain('Registered and activated')
  expect(container.textContent).not.toContain('review me')
})
it('filters directory projects and expands installation instructions', async () => {
  const entry = { id: 'articles', repositoryId: 1, repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', name: 'Article tools', description: 'Read articles', origin: 'https://example.com', tags: ['reading'], status: 'active' }
  mount(); await act(async () => { root!.render(createElement(WebMCPDirectory, { catalog: { formatVersion: 1, generatedAt: null, entries: [entry] }, locale: 'en' })) })
  await click('Use in DeepDeck')
  expect(container.textContent).toContain('Manifest path')
  await click('Use in DeepDeck')
  expect(container.textContent).not.toContain('Manifest path')
  const input = container.querySelector('input')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'unrelated'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(container.textContent).toContain('No matching projects')
})

it('searches automatically, refreshes empty results, and ignores results after changing sites', async () => {
  let complete!: (value: unknown) => void
  const empty = { formatVersion: 1, generatedAt: null, entries: [] }
  const request = vi.fn(async () => empty as unknown)
  request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const props = { site: { id: 'first', origin: 'https://first.example' }, browser: { request }, running: false, refresh: async () => {}, t: (key: keyof typeof en) => en[key] } as unknown as ComponentProps<typeof WebMCPCommunity>
  mount(); await act(async () => { root!.render(createElement(WebMCPCommunity, props)) })
  expect(container.textContent).toContain(en.communitySearching)
  expect(request).toHaveBeenCalledWith({ action: 'market.catalog', origin: 'https://first.example' }, expect.any(AbortSignal))
  await act(async () => { root!.render(createElement(WebMCPCommunity, { ...props, site: { ...props.site, id: 'second', origin: 'https://second.example' } })) })
  expect(container.textContent).toContain(en.communityEmpty)
  await act(async () => { complete({ ...empty, entries: [{ id: 'old', name: 'STALE RESULT' }] }) })
  expect(container.textContent).not.toContain('STALE RESULT')
  request.mockResolvedValueOnce({ ...empty, entries: [{ id: 'new', name: 'Fresh result', repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', status: 'active' }] })
  await click(en.communityRefresh)
  expect(container.textContent).toContain('Fresh result')
  expect(container.textContent).not.toContain(en.communityEmpty)
  expect(container.querySelector('a[href="/?deepdeck-surface=webmcp-market"]')).not.toBeNull()
})
it('distinguishes failed and bundled searches from a live empty result and permits retry', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('Unable to load')).mockResolvedValue({ formatVersion: 1, entries: [], source: 'bundled' })
  const props = { site: { id: 'site', origin: 'https://example.com' }, browser: { request }, running: false, refresh: async () => {}, t: (key: keyof typeof en) => en[key] } as unknown as ComponentProps<typeof WebMCPCommunity>
  mount(); await act(async () => { root!.render(createElement(WebMCPCommunity, props)) })
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unable to load')
  expect(container.textContent).not.toContain(en.communityEmpty)
  await click(en.communityRefresh)
  expect(container.textContent).toContain(en.communityBundledEmpty)
})

it('exports into the independent Files column without rendering an inline explorer', async () => {
  const request = vi.fn(async (input: any) => input.action === 'market.catalog'
    ? { formatVersion: 1, entries: [], generatedAt: null }
    : { directory: '/workspace/webmcp-publish-draft' })
  const onOpenFiles = vi.fn()
  const onPublish = vi.fn(async () => {})
  const Files = vi.fn(() => null)
  const props = { site: { id: 'site', origin: 'https://example.com', activeRevision: 'revision' }, browser: { request, Files }, running: false, refresh: async () => {}, onOpenFiles, onPublish, t: (key: keyof typeof en) => en[key] } as unknown as ComponentProps<typeof WebMCPCommunity>
  mount(); await act(async () => { root!.render(createElement(WebMCPCommunity, props)) })
  await click('Export GitHub draft')
  expect(request).toHaveBeenCalledWith({ action: 'market.export', siteId: 'site', revision: 'revision' })
  expect(onOpenFiles).toHaveBeenCalledWith({ kind: 'draft', draft: 'webmcp-publish-draft' })
  expect(Files).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('/workspace/webmcp-publish-draft')
  await click(en.communityPublishGithub)
  expect(onPublish).toHaveBeenCalledOnce()
})
