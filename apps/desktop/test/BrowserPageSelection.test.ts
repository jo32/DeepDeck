// @vitest-environment jsdom
import { act, createElement, Fragment, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { BrowserFrame } from '../../../plugins/browser/src/client/BrowserFrame.js'
import { BrowserPageSelection } from '../../../plugins/browser/src/client/BrowserPageSelection.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('opens the site conversation and appends an excerpt once without replacing or sending its draft', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const selection = { id: 'selection-1', tabId: 'tab', documentId: 'doc', text: 'First line\nSecond line', url: 'https://example.com/article', title: 'Example' }
  const state = { available: true, native: { open: true, activeTabId: 'tab', downloads: [], selections: [selection],
    tabs: [{ id: 'tab', documentId: 'doc', origin: 'https://example.com', url: 'https://example.com/article', title: 'Example', loading: false, tools: [] }] },
    sites: [{ id: 'site', origin: 'https://example.com', sessionId: 'session', mode: 'use', boundTabId: 'tab' }],
  }
  // Keep returning the same request to simulate an acknowledgement delayed by a poll.
  const request = vi.fn(async () => structuredClone(state))
  let draft = 'My existing question'
  const writeDraft = vi.fn((value: string) => { draft = value })
  function Composer() {
    const [input, setInput] = useState({ draft, phase: 'plain', imageIds: [], draftRev: 0 })
    const props = { input, inputActions: { setDraft(value: string) { writeDraft(value); setInput(previous => ({ ...previous, draft: value, draftRev: previous.draftRev + 1 })) } } } as ComponentProps<typeof BrowserPageSelection>
    return createElement(Fragment, null, createElement(BrowserPageSelection, props), createElement('textarea', { value: input.draft, readOnly: true }))
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  try {
    await act(async () => root.render(createElement(BrowserFrame, {
      character: { Icon: () => null, Character: () => null, DockedComposer: ({ children }: any) => children },
      browser: { request, prepareAgent: async () => ({ siteId: 'site', sessionId: 'session', tabId: 'tab' }) },
      t: (key: keyof typeof en) => en[key],
      useSessions: (select: any) => select({ current: 'session', byId: { session: { running: false } } }),
      renderConversation: () => createElement(Composer),
    } as unknown as ComponentProps<typeof BrowserFrame>)))
    expect(draft).toBe('My existing question\n\nhttps://example.com/article\n> First line\n> Second line\n\n')
    expect(writeDraft).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith({ action: 'command', command: { action: 'page.selection.ack', id: selection.id } })
    await act(async () => button('Hide Agent').click())
    expect(container.querySelector('aside')).toBeNull()
    state.native.selections = [{ ...selection, id: 'selection-2', text: 'Another excerpt' }]
    await act(async () => button('Reload').click())
    expect(container.querySelector('aside')).not.toBeNull()
    expect(container.querySelector('textarea')?.value).toContain('> Another excerpt')
    expect(writeDraft).toHaveBeenCalledTimes(2)
    expect(draft.match(/First line/g)).toHaveLength(1)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
