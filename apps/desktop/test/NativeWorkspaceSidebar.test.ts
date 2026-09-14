// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { createSidebarStore, allLeaves } from '../../../plugins/browser/node_modules/dsh-better-sidebar/src/client/state.ts'
import { createBetterSidebarService } from '../../../plugins/browser/node_modules/dsh-better-sidebar/src/client/service.ts'
import { installNativeWorkspaceSidebar } from '../../../plugins/browser/src/client/NativeWorkspaceSidebar.js'

it('routes workspace tools and file resources into the native sidebar without opening another workbench', () => {
  localStorage.clear()
  const store = createSidebarStore()
  const service = createBetterSidebarService(store)
  for (const id of ['editor', 'git', 'terminal']) service.registerTab({ id, title: id, component: () => null })
  let current = 'first'
  const listeners = new Set<() => void>()
  const cleanups: Array<() => void> = []
  const definitions = new Map<string, { kind: string; patterns?: readonly string[] }>()
  const slots = new Set<string>()
  const native = { openTab: vi.fn(), openResource: vi.fn(), openTabIn: vi.fn(), openResourceIn: vi.fn() }
  const registry = { register: (definition: { id: string; kind: string }) => {
    definitions.set(definition.id, definition)
    return () => definitions.delete(definition.id)
  } }
  const context = {
    locale: { bind: () => () => 'Open workspace sidebar' },
    sessions: { list: { getSnapshot: () => ({ current }), subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) } } },
    get: (name: string) => name === 'sidebarRight' ? native : registry,
    inject: (_deps: string[], setup: (ctx: unknown) => () => void) => ({ dispose: setup(context) }),
    effect: (setup: () => () => void) => cleanups.push(setup()),
    slots: {
      inject: (_name: string, setup: () => () => void) => { const dispose = setup(); cleanups.push(dispose); return dispose },
      register: ({ name, key }: { name: string; key: string }) => { slots.add(`${name}:${key}`); return () => slots.delete(`${name}:${key}`) },
    },
  }
  try {
    installNativeWorkspaceSidebar(context as unknown as Parameters<typeof installNativeWorkspaceSidebar>[0], store, service)
    expect([...definitions.values()].map(value => value.kind)).toEqual(expect.arrayContaining(['editor', 'files', 'git', 'terminal']))
    expect(definitions.get('dsh-better-sidebar:editor')?.patterns).toEqual(['dsh-resource://file/**'])
    expect([...slots].every(name => name.startsWith('sidebar.right.pane.tab') || name === 'desktop.workspace-toggle:undefined')).toBe(true)
    service.openTab({ type: 'git' })
    expect(native.openTab).toHaveBeenLastCalledWith('git', expect.anything())
    service.openTab({ type: 'editor', path: '/first/readme.md' }, { sessionId: 'first', cwd: '/first' })
    expect(native.openResource).toHaveBeenCalledWith(expect.stringContaining('readme.md'), expect.anything())
    service.openTab({ type: 'editor' })
    expect(native.openTab).toHaveBeenLastCalledWith('files', expect.anything())
    expect(allLeaves(store.getSnapshot().state!.bottomSplits).flatMap(leaf => leaf.tabs)).toEqual([])
    expect(store.getSnapshot().state!.bottomOpen).toBe(false)
    current = 'second'
    listeners.forEach(listener => listener())
    expect(store.getSnapshot().sessionId).toBe('second')
    service.openTab({ type: 'terminal' })
    expect(native.openTab).toHaveBeenLastCalledWith('terminal', expect.anything())
    service.openTab({ type: 'git' }, { sessionId: 'first' })
    expect(native.openTabIn).toHaveBeenCalledWith('first', 'git', expect.anything())
    store.setPrefs({ ...store.getPrefs(), tabsEnabled: { ...store.getPrefs().tabsEnabled, git: false } })
    expect([...definitions.values()].some(value => value.kind === 'git')).toBe(false)
  } finally {
    cleanups.reverse().forEach(cleanup => cleanup())
    expect(listeners.size).toBe(0)
    expect(definitions.size).toBe(0)
    expect(slots.size).toBe(0)
    localStorage.clear()
  }
})

it('retains the workspace width across collapse, fullscreen and narrow-window presentation', async () => {
  const { createLayoutStore } = await import('../../../plugins/desktop-chrome/src/client/stores.ts')
  const layout = createLayoutStore().create()
  layout.actions.setDetails(440)
  layout.actions.closeRightbar()
  expect(layout.getSnapshot().details).toBe(0)
  layout.actions.openRightbar(true, false)
  expect(layout.getSnapshot().details).toBe(440)
  layout.actions.openRightbar(false, true)
  expect(layout.getSnapshot().details).toBe(0)
  layout.actions.openRightbar(true, false)
  expect(layout.getSnapshot().details).toBe(440)
  layout.actions.closeDetails()
  layout.actions.openDetails()
  expect(layout.getSnapshot().details).toBe(440)
})
