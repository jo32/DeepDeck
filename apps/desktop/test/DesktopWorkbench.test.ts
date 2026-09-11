// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { createSidebarStore } from '../../../plugins/browser/node_modules/dsh-better-sidebar/src/client/state.ts'
import { createBetterSidebarService } from '../../../plugins/browser/node_modules/dsh-better-sidebar/src/client/service.ts'
import { DesktopWorkbench } from '../../../plugins/browser/src/client/DesktopWorkbench.js'
import { en } from '../../../plugins/browser/src/client/locales.js'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('keeps sidebar state per session, opens tabs, resizes and restores the collapsed panel', async () => {
  localStorage.clear()
  const store = createSidebarStore()
  store.setPrefs({ ...store.getPrefs(), openByDefault: true })
  const service = createBetterSidebarService(store)
  service.registerTab({ id: 'editor', title: 'Files', component: props => createElement('p', null, `Files: ${props.scope.cwd}`) })
  service.registerTab({ id: 'git', title: 'Git', component: props => createElement('div', null, `Git: ${props.scope.cwd}`, createElement('input', { 'aria-label': 'Draft' })) })
  let sessions = { current: 'first', byId: { first: { cwd: '/first' }, second: { cwd: '/second' } } }
  const listeners = new Set<() => void>()
  const ctx = { locale: { bind: () => (key: keyof typeof en) => en[key] }, sessions: { list: {
    getSnapshot: () => sessions,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
  } } } as unknown as ComponentProps<typeof DesktopWorkbench>['ctx']
  const container = document.createElement('div')
  const root = createRoot(container)
  const click = async (label: string) => { await act(async () => { container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click() }) }
  try {
    await act(async () => { root.render(createElement(DesktopWorkbench, { ctx, store, service })) })
    expect(container.textContent).toContain('Files: /first')
    await act(async () => { const select = container.querySelector('select')!; select.value = 'git'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Git')
    const width = store.getSnapshot().state!.width
    await act(async () => { container.querySelector('[role=separator]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    expect(store.getSnapshot().state!.width).toBeLessThan(width)
    const draft = container.querySelector('input')!
    draft.value = 'unsaved content'
    await click(en.sidebarClose)
    expect(container.querySelector('aside')?.hidden).toBe(true)
    await click(en.sidebarOpen)
    expect(container.querySelector('aside')?.hidden).toBe(false)
    expect(container.querySelector('input')).toBe(draft)
    expect(container.querySelector('input')?.value).toBe('unsaved content')
    expect(container.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Git')
    const switchSession = async (current: string) => { await act(async () => { sessions = { ...sessions, current }; listeners.forEach(listener => listener()) }) }
    await switchSession('second')
    expect(container.textContent).toContain('Files: /second')
    expect(container.textContent).not.toContain('Git: /first')
    await switchSession('first')
    expect(container.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Git')
    await click(`${en.closeTab}: Git`)
    expect(container.textContent).not.toContain('Git: /first')
  } finally { await act(async () => { root.unmount() }); localStorage.clear() }
})
