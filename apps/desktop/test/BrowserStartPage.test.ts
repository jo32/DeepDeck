// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserFrame } from '../../../plugins/browser/src/client/BrowserFrame.js'
import type { BrowserClientAction, BrowserSite, BrowserState } from '../../../plugins/browser/src/contracts.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let container: HTMLDivElement
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  vi.unstubAllGlobals()
})

async function render() {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const state: BrowserState = {
    available: true,
    native: { open: true, activeTabId: 'blank', downloads: [], tabs: [{ id: 'blank', url: 'about:blank', origin: '', title: 'New tab', documentId: 'doc', loading: false, tools: [], canGoBack: false, canGoForward: false }] },
    sites: Array.from({ length: 5 }, (_, index) => ({ id: `site-${index}`, title: `Site ${index}`, origin: `https://site${index}.example`, workspaceId: 'workspace', workspacePath: '/tmp/site', mode: 'use', enabled: true, revisions: [] } satisfies BrowserSite)),
  }
  const request = vi.fn(async (action: BrowserClientAction) => {
    if (action.action === 'command') {
      if (action.command.action === 'tab.navigate') {
        const tab = state.native.tabs[0]
        tab.url = action.command.url
        tab.origin = new URL(tab.url).origin
        state.sites = []
      }
      if (action.command.action === 'tab.open') {
        state.native.activeTabId = 'another-blank'
        state.native.tabs = [{ ...state.native.tabs[0], id: 'another-blank', url: 'about:blank', origin: '' }]
      }
      return structuredClone(state.native)
    }
    return structuredClone(state)
  })
  const sessions = { byId: {} as Record<string, unknown>, current: undefined as string | undefined }
  const prepareAgent = vi.fn(async (_tabId, mode) => {
    const origin = state.native.tabs[0].origin
    state.sites = [{ id: 'site', origin, workspaceId: 'workspace', workspacePath: '/tmp/site', title: 'Site', mode, enabled: true, revisions: [], sessionId: 'session' }]
    sessions.byId.session = { running: false }
    sessions.current = 'session'
    return { siteId: 'site', sessionId: 'session', tabId: 'blank' }
  })
  const props = {
    character: { Icon: () => null, Character: () => null, DockedComposer: ({ children }: any) => children },
    browser: { request, prepareAgent }, t: (key: keyof typeof en) => en[key],
    useSessions: (select: (snapshot: unknown) => unknown) => select(sessions),
    renderConversation: () => createElement('textarea', { 'aria-label': 'Message the agent' }),
  } as unknown as ComponentProps<typeof BrowserFrame>
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(BrowserFrame, props)) })
  return { request, prepareAgent }
}

function button(label: string) {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
  return buttons.find(item => item.getAttribute('aria-label') === label) ?? buttons.find(item => item.textContent === label)!
}

describe('Browser start page', () => {
  it('opens the site conversation automatically and reconnects after hiding the panel', async () => {
    const { prepareAgent } = await render()
    await act(async () => { container.querySelector<HTMLButtonElement>('[title="https://site0.example"]')!.click() })
    expect(prepareAgent).toHaveBeenCalledWith('blank', 'use', 'auto', expect.any(AbortSignal))
    expect(container.querySelector('textarea[aria-label="Message the agent"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Start site Agent')
    await act(async () => { button('Hide Agent').click() })
    expect(container.querySelector('aside')).toBeNull()
    await act(async () => { button('Site Agent').click() })
    expect(container.querySelector('textarea')).not.toBeNull()
  })

  it('keeps a new tab full width, while explicit Downloads and Agent actions remain usable', async () => {
    const { request } = await render()
    expect(container.querySelector('aside')).toBeNull()
    expect(request).toHaveBeenCalledWith({ action: 'command', command: { action: 'layout', top: 0, right: 0 } })
    await act(async () => { button('Downloads').click() })
    expect(container.querySelector('aside')?.textContent).toContain('No downloads yet.')
    await act(async () => { button('Hide Agent').click() })
    expect(container.querySelector('aside')).toBeNull()
    await act(async () => { button('Site Agent').click() })
    expect(container.querySelector('aside')).not.toBeNull()
    await act(async () => { button('New tab').click() })
    expect(container.querySelector('aside')).toBeNull()
  })

  it('reveals saved sites and opens the chosen website in Builder through the existing Agent service', async () => {
    const { request, prepareAgent } = await render()
    expect(container.querySelector('[title="https://site4.example"]')).toBeNull()
    await act(async () => { button('Show all').click() })
    expect(container.querySelector('[title="https://site4.example"]')).not.toBeNull()
    const builder = [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(item => item.textContent?.includes('WEBMCP BUILDER'))!
    await act(async () => { builder.click() })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('New tab search')
    expect(builder.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { container.querySelector<HTMLButtonElement>('[title="https://site4.example"]')!.click() })
    expect(request).toHaveBeenCalledWith({ action: 'command', command: { action: 'tab.navigate', tabId: 'blank', url: 'https://site4.example/' } })
    expect(prepareAgent).toHaveBeenCalledWith('blank', 'builder', true)
    expect(container.querySelector('aside')).not.toBeNull()
  })
})
