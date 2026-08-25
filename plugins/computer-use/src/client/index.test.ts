import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from './index.ts'
import { ComputerUseSettingsRow } from './ComputerUseSettingsRow.tsx'
import { ComputerUseToggle, type ComputerUseInjected } from './ComputerUseToggle.tsx'

describe('computer-use client plugin', () => {
  it('registers one shared preference in Settings and the composer slot', async () => {
    const set = vi.fn(async () => {})
    const scope = {
      getSnapshot: () => ({
        status: 'ready',
        value: { enabled: true },
        base: { enabled: true },
        user: undefined,
        revision: 0,
        writable: true,
        mode: 'host',
      }),
      subscribe: () => () => {},
      set,
      unset: vi.fn(async () => {}),
    }
    const entries: Array<{
      name: string
      options: Record<string, unknown>
      component: unknown
    }> = []
    const ctx = {
      effect: (setup: () => unknown) => { setup() },
      locale: { register: vi.fn(() => () => {}) },
      settingsScope: { bind: vi.fn(() => scope) },
      slots: {
        inject: (name: string, register: () => unknown) => { register(); return () => {} },
        register: (options: Record<string, unknown>, component: unknown) => {
          entries.push({ name: String(options.name), options, component })
          return () => {}
        },
      },
    }

    apply(ctx as never)

    expect(inject).toEqual(['slots', 'locale', 'settingsScope'])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      name: 'settings.general.item',
      options: { id: 'computer-use', order: -10 },
      component: ComputerUseSettingsRow,
    })
    expect(entries[1]).toMatchObject({
      name: 'conversation.input.left',
      options: { id: 'computer-use', order: -100 },
      component: ComputerUseToggle,
    })

    const injected = (entries[0]?.options.inject as () => ComputerUseInjected)()
    expect(injected.hooks.computerUse).toBe(scope)
    await injected.setEnabled(false)
    expect(set).toHaveBeenCalledWith('enabled', false)
  })
})
