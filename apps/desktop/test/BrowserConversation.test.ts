// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { BrowserEmptyConversation, BrowserConversationContext } from '../../../plugins/browser/src/client/BrowserConversation.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('shows a welcome in the Browser message area only for a confirmed empty session', async () => {
  const container = document.createElement('div')
  const welcomeTarget = document.createElement('div')
  document.body.append(container, welcomeTarget)
  const root = createRoot(container)
  const session = { openState: 'loading', blank: true, composerPhase: 'blank' }
  let mode: 'use' | 'builder' = 'use'
  const render = () => act(async () => root.render(createElement(BrowserConversationContext.Provider, {
    value: { mode, welcomeTarget, t: ((key: keyof typeof en) => en[key]) as any },
  }, createElement(BrowserEmptyConversation, { session } as ComponentProps<typeof BrowserEmptyConversation>))))
  try {
    await render()
    expect(welcomeTarget.textContent).toBe('')
    session.openState = 'open'
    await render()
    expect(welcomeTarget.textContent).toContain('What can I help you with?')
    expect(container.textContent).toBe('')
    mode = 'builder'
    await render()
    expect(welcomeTarget.textContent).toContain('What would you like this site to do?')
    session.composerPhase = 'engaging'
    await render()
    expect(welcomeTarget.textContent).toBe('')
    session.blank = false
    session.composerPhase = 'active'
    await render()
    expect(welcomeTarget.textContent).toBe('')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    welcomeTarget.remove()
  }
})
