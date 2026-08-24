// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppsSettingsSection } from '../../../plugins/app-conversations/src/client/AppsSettingsSection.tsx'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: string) => key) as ComponentProps<typeof AppsSettingsSection>['t']
let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root !== undefined) await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
  vi.unstubAllGlobals()
})

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function actionFrom(init?: RequestInit): string {
  return String((JSON.parse(String(init?.body)) as { action?: unknown }).action)
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(candidate => candidate.textContent === label)
}

async function render(overrides: Partial<ComponentProps<typeof AppsSettingsSection>> = {}): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(AppsSettingsSection, {
      close: vi.fn(),
      renderSlot: vi.fn(() => null),
      t,
      openCreator: vi.fn(async () => {}),
      dispatchUpdate: vi.fn(async () => {}),
      ...overrides,
    } as never))
  })
}

describe('AppsSettingsSection package controls', () => {
  it('creates a starter App from the new button and offers to restart', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const action = actionFrom(init)
      if (action === 'list-apps') return response({ apps: [] })
      if (action === 'create-app') return response({
        created: {
          appId: 'project-brief',
          title: 'Project Brief',
          packageName: '@deepdeck-apps/project-brief',
          version: '0.1.0',
          sourceDirectory: '/Users/test/DeepDeck/Plugins/project-brief',
          profileAction: 'install',
          completedAt: '2026-08-24T00:00:00.000Z',
          installLog: '',
          buildLog: '',
          packageLog: '',
          createdFromTemplate: true,
          restartRequired: true,
        },
      })
      throw new Error(`unexpected action ${action}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    await render()

    await act(async () => { button('newApp')?.click() })
    const name = document.querySelector<HTMLInputElement>('#deepdeck-create-app-title')
    expect(name).toBeDefined()
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(name, 'Project Brief')
      name?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.querySelector<HTMLInputElement>('#deepdeck-create-app-id')?.value).toBe('project-brief')

    await act(async () => { button('createApp')?.click() })
    await vi.waitFor(() => expect(document.body.textContent).toContain('createComplete'))
    expect(fetchMock.mock.calls.map(call => actionFrom(call[1]))).toContain('create-app')
    expect(document.body.textContent).toContain('/Users/test/DeepDeck/Plugins/project-brief')
    expect(button('restartNow')).toBeDefined()
  })

  it('keeps Escape scoped to the nested New App dialog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ apps: [] })))
    const parentEscape = vi.fn()
    document.addEventListener('keydown', parentEscape)
    try {
      await render()
      await act(async () => { button('newApp')?.click() })
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()

      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(parentEscape).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', parentEscape)
    }
  })

  it('previews a Git source and confirms installation into the Vibe plugin directory', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const action = actionFrom(init)
      if (action === 'list-apps') return response({ apps: [] })
      if (action === 'preview-install') return response({
        installPreview: {
          previewId: 'preview-1',
          appId: 'reader',
          title: 'Reader',
          packageName: '@fixture/reader',
          version: '1.0.0',
          sourceKind: 'git-repository',
          profileAction: 'install',
          sourceDirectory: '/Users/test/DeepDeck/Plugins/reader',
          buildScript: 'pnpm build',
          frozenInstall: true,
          warnings: [],
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      })
      if (action === 'install') return response({
        install: {
          appId: 'reader',
          title: 'Reader',
          packageName: '@fixture/reader',
          version: '1.0.0',
          sourceDirectory: '/Users/test/DeepDeck/Plugins/reader',
          profileAction: 'install',
          completedAt: '2026-08-24T00:00:00.000Z',
          installLog: '',
          buildLog: '',
          packageLog: '',
          restartRequired: true,
        },
      })
      throw new Error(`unexpected action ${action}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    await render()

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="installSource"]')
    expect(input).toBeDefined()
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(input, 'https://example.com/reader.git')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { button('probeInstall')?.click() })
    await vi.waitFor(() => expect(container?.textContent).toContain('/Users/test/DeepDeck/Plugins/reader'))

    await act(async () => { button('confirmInstall')?.click() })
    await vi.waitFor(() => expect(container?.textContent).toContain('installComplete'))
    expect(fetchMock.mock.calls.map(call => actionFrom(call[1]))).toContain('install')
    expect(button('restartNow')).toBeDefined()
  })

  it('labels an existing unmounted dependency as a repair install', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const action = actionFrom(init)
      if (action === 'list-apps') return response({ apps: [] })
      if (action === 'preview-install') return response({
        installPreview: {
          previewId: 'preview-repair',
          appId: 'reader',
          title: 'Reader',
          packageName: '@fixture/reader',
          version: '1.0.0',
          sourceKind: 'local-directory',
          profileAction: 'repair',
          sourceDirectory: '/Users/test/DeepDeck/Plugins/reader',
          buildScript: 'pnpm build',
          frozenInstall: true,
          warnings: [],
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      })
      throw new Error(`unexpected action ${action}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    await render()

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="installSource"]')
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(input, '/legacy/reader')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { button('probeInstall')?.click() })
    await vi.waitFor(() => expect(button('confirmRepair')).toBeDefined())
    expect(container?.textContent).toContain('profileRepair')
    expect(container?.textContent).toContain('repairWarning')
  })

  it('requires a second click to uninstall and reports that the source is retained', async () => {
    let uninstalled = false
    const descriptor = {
      id: 'reader',
      title: 'Reader',
      packageName: '@fixture/reader',
      updateAvailable: true,
      rebuildAvailable: true,
      uninstallAvailable: true,
    }
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const action = actionFrom(init)
      if (action === 'list-apps') return response({
        apps: [{ ...descriptor, uninstallAvailable: !uninstalled }],
      })
      if (action === 'uninstall') {
        uninstalled = true
        return response({
          uninstall: {
            packageName: '@fixture/reader',
            sourceDirectory: '/Users/test/DeepDeck/Plugins/reader',
            sourceRetained: true,
            packageLog: '',
            completedAt: '2026-08-24T00:00:00.000Z',
            restartRequired: true,
          },
        })
      }
      throw new Error(`unexpected action ${action}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    await render()
    await vi.waitFor(() => expect(button('uninstall')).toBeDefined())

    await act(async () => { button('uninstall')?.click() })
    expect(fetchMock.mock.calls.map(call => actionFrom(call[1]))).not.toContain('uninstall')
    expect(container?.textContent).toContain('confirmUninstallTitle')

    await act(async () => { button('confirmUninstall')?.click() })
    await vi.waitFor(() => expect(container?.textContent).toContain('sourceRetained'))
    expect(fetchMock.mock.calls.map(call => actionFrom(call[1]))).toContain('uninstall')
    expect(container?.textContent).toContain('/Users/test/DeepDeck/Plugins/reader')
  })

  it('dispatches an Agent update task from the App action row', async () => {
    const dispatchUpdate = vi.fn(async () => {})
    const close = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const action = actionFrom(init)
      if (action === 'list-apps') return response({
        apps: [{
          id: 'reader',
          title: 'Reader',
          packageName: '@fixture/reader',
          updateAvailable: true,
          rebuildAvailable: true,
          uninstallAvailable: true,
        }],
      })
      throw new Error(`unexpected action ${action}`)
    }))
    await render({ dispatchUpdate, close })
    await vi.waitFor(() => expect(button('updateWithAgent')).toBeDefined())

    await act(async () => { button('updateWithAgent')?.click() })
    await vi.waitFor(() => expect(dispatchUpdate).toHaveBeenCalledWith('reader'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not let Vibe Coding and Agent update claim the same blank session concurrently', async () => {
    let finishCreator: (() => void) | undefined
    const openCreator = vi.fn(async () => await new Promise<void>(resolve => { finishCreator = resolve }))
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (actionFrom(init) === 'list-apps') return response({
        apps: [{
          id: 'reader',
          title: 'Reader',
          packageName: '@fixture/reader',
          updateAvailable: true,
          rebuildAvailable: true,
          uninstallAvailable: true,
        }],
      })
      throw new Error('unexpected request')
    }))
    await render({ openCreator })
    await vi.waitFor(() => expect(button('vibeCoding')).toBeDefined())

    await act(async () => { button('vibeCoding')?.click() })
    expect(button('updateWithAgent')?.disabled).toBe(true)
    expect(button('rebuildWithBun')?.disabled).toBe(true)
    expect(button('uninstall')?.disabled).toBe(true)

    await act(async () => { finishCreator?.() })
  })
})
