// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { BrowserFrame } from '../../../plugins/browser/src/client/BrowserFrame.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('keeps the resource navigation seat mounted while reserving native page space only when opened', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: this.getAttribute('aria-label') === en.filesPreview && this.dataset.open ? 360 : 0, bottom: 100 } as DOMRect
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const mounted = vi.fn(), unmounted = vi.fn()
  function ResourceSeat() {
    useEffect(() => { mounted(); return () => { unmounted() } }, [])
    return createElement('div', { 'data-resource-seat': true }, 'File content')
  }
  const request = vi.fn(async () => ({ available: true, native: { open: true, tabs: [], downloads: [] }, sites: [] }))
  const props = {
    browser: { request }, character: { Icon: () => null, Character: () => null },
    t: (key: keyof typeof en) => en[key], renderConversation: () => null,
    renderResources: () => createElement(ResourceSeat), resourcesOpen: false,
    useSessions: (select: (value: unknown) => unknown) => select({ byId: {}, current: undefined }),
  } as unknown as ComponentProps<typeof BrowserFrame>
  try {
    for (const open of [false, true, false, true]) {
      request.mockClear()
      await act(async () => root.render(createElement(BrowserFrame, { ...props, resourcesOpen: open })))
      expect(container.querySelector('[data-resource-seat]')).not.toBeNull()
      expect(request).toHaveBeenCalledWith({ action: 'command', command: { action: 'layout', top: 100, right: open ? 360 : 0 } })
    }
    expect(mounted).toHaveBeenCalledOnce()
    expect(unmounted).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    container.remove(); bounds.mockRestore(); vi.unstubAllGlobals()
  }
})
