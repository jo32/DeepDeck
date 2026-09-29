// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserComposerModel, BrowserComposerOverflow, BrowserComposerProvider } from './BrowserComposerOverflow.js'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([360, 420])('keeps portaled model choices interactive at %ipx and dismisses outside', async width => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: 40, top: 600, bottom: 640, left: 0, right: width, x: 0, y: 600, toJSON() {} })
  const selected = vi.fn()
  function Model() {
    const [pane, setPane] = useState(0)
    return <><button onClick={() => setPane(1)}>Current model</button>
      {pane > 0 && createPortal(<div role="menu">{pane === 1
        ? <button onClick={() => setPane(2)}>Model choices</button>
        : <button onClick={() => { selected(); setPane(0) }}>Another model</button>}</div>, document.body)}</>
  }
  function Fixture() {
    const panel = useRef<HTMLElement>(null)
    return <aside ref={panel}><BrowserComposerProvider panel={panel}>
      <BrowserComposerModel><Model /></BrowserComposerModel>
      <BrowserComposerOverflow {...{ sessionId: 'fixture', renderSlot: () => null, t: (key: string) => key } as any} />
    </BrowserComposerProvider></aside>
  }
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  const click = async (label: string) => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label)!
    expect(button).toBeTruthy()
    await act(async () => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      button.click()
    })
  }
  const expanded = () => document.querySelector('[role="dialog"]')?.getAttribute('aria-hidden') === 'false'
  try {
    await act(async () => root.render(<Fixture />))
    await click('moreComposer')
    await click('Current model')
    await click('Model choices')
    expect(expanded()).toBe(true)
    await click('Another model')
    expect(selected).toHaveBeenCalledOnce()
    expect(expanded()).toBe(true)
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(expanded()).toBe(false)
    await click('moreComposer')
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(expanded()).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
