// @vitest-environment jsdom

import { act, createElement, useState, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSessionHeader } from '../../../plugins/browser/src/client/BrowserSessionHeader.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let container: HTMLDivElement

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
})

describe('Browser conversation without a session toolbar', () => {
  it('returns a saved Trajectory view to Chat without rendering switch or export controls', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const setView = vi.fn()
    function Session() {
      const [view, updateView] = useState('traj')
      const props = {
        useStore: (select: (state: { view: string }) => unknown) => select({ view }),
        actions: { setView: (next: string) => { setView(next); updateView(next) } },
      } as unknown as ComponentProps<typeof BrowserSessionHeader>
      return createElement(BrowserSessionHeader, props)
    }
    await act(async () => { root?.render(createElement(Session)) })
    expect(setView).toHaveBeenCalledExactlyOnceWith('chat')
    expect(container.childNodes).toHaveLength(0)
  })
})
