// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserFrame } from '../../../plugins/browser/src/client/BrowserFrame.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let container: HTMLDivElement
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  vi.unstubAllGlobals()
})

describe('Browser tab pointer actions', () => {
  it('middle-clicks close once across the tab hit area and right-clicks preserve the active tab', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const native = { open: true, activeTabId: 'a', downloads: [], tabs: ['a', 'b'].map(id => ({
      id, title: `Tab ${id}`, url: `https://${id}.example/`, origin: `https://${id}.example`, loading: false, tools: [],
    })) }
    const request = vi.fn(async (_input: unknown) => ({ available: true, native, sites: [] }))
    container = document.createElement('div'); document.body.append(container)
    root = createRoot(container)
    const props = {
    character: { Icon: () => null, Character: () => null }, browser: { request, prepareAgent: vi.fn(async () => undefined) }, t: (key: keyof typeof en) => en[key], renderConversation: () => null,
      useSessions: (select: (snapshot: unknown) => unknown) => select({ byId: {}, current: undefined }) } as unknown as ComponentProps<typeof BrowserFrame>
    await act(async () => { root?.render(createElement(BrowserFrame, props)) })
    const background = container.querySelectorAll('[role="tablist"] [role="tab"]')[1]!
    const close = container.querySelector('[aria-label="Close tab: Tab b"]')!
    for (const target of [background.querySelector('span')!, close]) {
      request.mockClear()
      await act(async () => {
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1, cancelable: true }))
        target.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1, cancelable: true }))
      })
      const commands = request.mock.calls.map(args => args[0]).filter((call: any) => call?.action === 'command')
      expect(commands).toEqual([{ action: 'command', command: { action: 'tab.close', tabId: 'b' } }])
    }
    request.mockClear()
    await act(async () => { close.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 220, clientY: 28, cancelable: true })) })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'tab.menu', x: 220, y: 28,
      items: expect.arrayContaining([expect.objectContaining({ command: { action: 'tab.closeOthers', tabId: 'b' } })]) }) }))
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'tab.activate' }) }))
  })
})
