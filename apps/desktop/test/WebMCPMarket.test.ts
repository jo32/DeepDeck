// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WebMCPMarket } from '../../../plugins/browser/src/client/WebMCPMarket.js'
import { browserRequest } from '../../../plugins/browser/src/client/browser-api.js'
import { en } from '../../../plugins/browser/src/client/locales.js'
vi.mock('../../../plugins/browser/src/client/browser-api.js', () => ({ browserRequest: vi.fn() }))

it('accepts installation requests only from its connected market frame and requires confirmation', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const previousShow = HTMLDialogElement.prototype.showModal
  const previousClose = HTMLDialogElement.prototype.close
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open') }
  const site = { id: 'site', origin: 'https://example.com' }
  const preview = { token: 'once', source: 'review me', manifest: { name: 'Read', version: '1.0.0', description: 'Read articles', license: 'MIT', tools: [] }, provenance: { repository: 'https://github.com/test/repo', commit: 'a'.repeat(40), author: { login: 'test', url: 'https://github.com/test', avatarUrl: 'https://github.com/test.png?size=80' } } }
  vi.mocked(browserRequest).mockImplementation(async input => input.action === 'market.prepare' ? { site, preview } : site as any)
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(WebMCPMarket, { t: (key: keyof typeof en) => en[key], marketUrl: 'https://deepdeck.getmegaportal.com/webmcp' })))
    const frame = container.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    await act(async () => frame.dispatchEvent(new Event('load')))
    const nonce = (post.mock.calls[0]![0] as { nonce: string }).nonce
    const data = { type: 'deepdeck.webmcp.install', nonce, package: { repository: 'https://github.com/test/repo', manifestPath: 'webmcp.json' } }
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.test', source: frame.contentWindow, data })); window.dispatchEvent(new MessageEvent('message', { origin: 'https://deepdeck.getmegaportal.com', source: window, data })) })
    expect(browserRequest).not.toHaveBeenCalled()
    await act(async () => window.dispatchEvent(new MessageEvent('message', { origin: 'https://deepdeck.getmegaportal.com', source: frame.contentWindow, data })))
    expect(browserRequest).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog')!.open).toBe(true)
    expect(container.textContent).toContain('@test')
    const button = [...container.querySelectorAll('button')].find(el => el.textContent === 'Install on this site')!
    await act(async () => button.click())
    expect(browserRequest).toHaveBeenLastCalledWith({ action: 'market.install', siteId: 'site', token: 'once', openSite: true })
    expect(container.querySelector('dialog')!.open).toBe(false)
    expect(container.textContent).toContain('Installed and activated')
  } finally { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); HTMLDialogElement.prototype.showModal = previousShow; HTMLDialogElement.prototype.close = previousClose }
})

it('ships a local directory in Settings without requesting an unpublished iframe page', async () => {
  const previousClose = HTMLDialogElement.prototype.close
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open') }
  vi.mocked(browserRequest).mockClear()
  vi.mocked(browserRequest).mockResolvedValue({ catalog: { formatVersion: 1, generatedAt: null, entries: [] }, source: 'bundled' })
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(WebMCPMarket, { t: (key: keyof typeof en) => en[key] })))
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).toContain('The first project starts with you.')
    expect(container.textContent).toContain('Showing the bundled directory')
    expect(container.textContent).toContain('Install from GitHub')
    expect(container.textContent).not.toContain('Connecting to the market')
    expect(browserRequest).toHaveBeenCalledWith({ action: 'market.directory' }, expect.any(AbortSignal))
  } finally { await act(async () => root.unmount()); container.remove(); HTMLDialogElement.prototype.close = previousClose }
})
