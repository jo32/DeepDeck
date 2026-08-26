import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  COMPUTER_USE_MCP_ENTRY_ID,
  ComputerUseSettingsSchema,
  ComputerUseLoaderGate,
  ComputerUsePermissionOnboarding,
  isComputerUseToolName,
  resolveSiblingLoaderEntryId,
} from './index.ts'

interface FakeEntry {
  options: { disabled?: boolean }
}

function fakeLoader(initiallyDisabled: boolean) {
  const entry: FakeEntry = { options: { disabled: initiallyDisabled } }
  const update = vi.fn(async (_id: string, options: { disabled?: boolean }) => {
    entry.options = { ...entry.options, ...options }
  })
  return {
    entry,
    update,
    loader: {
      resolve: vi.fn(() => entry),
      update,
    },
  }
}

describe('ComputerUseLoaderGate', () => {
  it('defaults fresh profiles to enabled', () => {
    expect(ComputerUseSettingsSchema({})).toEqual({ enabled: true })
  })

  it('targets a sibling inside the current nested loader tree', () => {
    expect(resolveSiblingLoaderEntryId(
      'include:deepdeck-computer-use',
      COMPUTER_USE_MCP_ENTRY_ID,
    )).toBe('include:deepdeck-computer-use-mcp')
  })

  it('recognizes only tools from the Open Computer Use MCP namespace', () => {
    expect(isComputerUseToolName('mcp__open-computer-use__get_app_state')).toBe(true)
    expect(isComputerUseToolName('mcp__another-server__get_app_state')).toBe(false)
    expect(isComputerUseToolName('computer-use')).toBe(false)
  })

  it('leaves the default-enabled MCP entry running', async () => {
    const fake = fakeLoader(false)
    const gate = new ComputerUseLoaderGate(fake.loader as never)

    await gate.setEnabled(true)

    expect(fake.update).not.toHaveBeenCalled()
  })

  it('disables and re-enables the actual MCP loader entry', async () => {
    const fake = fakeLoader(false)
    const gate = new ComputerUseLoaderGate(fake.loader as never)

    await gate.setEnabled(false)
    await gate.setEnabled(true)

    expect(fake.update).toHaveBeenNthCalledWith(
      1,
      COMPUTER_USE_MCP_ENTRY_ID,
      { disabled: true },
    )
    expect(fake.update).toHaveBeenNthCalledWith(
      2,
      COMPUTER_USE_MCP_ENTRY_ID,
      { disabled: false },
    )
  })

  it('serializes rapid preference changes in request order', async () => {
    const fake = fakeLoader(false)
    let releaseFirst: (() => void) | undefined
    fake.update.mockImplementationOnce(async (_id, options) => {
      await new Promise<void>(resolve => { releaseFirst = resolve })
      fake.entry.options = { ...fake.entry.options, ...options }
    })
    const gate = new ComputerUseLoaderGate(fake.loader as never)

    const off = gate.setEnabled(false)
    const on = gate.setEnabled(true)
    await vi.waitFor(() => { expect(releaseFirst).toBeTypeOf('function') })
    expect(fake.update).toHaveBeenCalledTimes(1)
    releaseFirst?.()
    await Promise.all([off, on])

    expect(fake.entry.options.disabled).toBe(false)
    expect(fake.update).toHaveBeenCalledTimes(2)
  })

  it('enables the MCP row silently and requests permissions on first tool use', async () => {
    const entry: FakeEntry & { options: FakeEntry['options'] & { id?: string } } = {
      options: { disabled: true },
    }
    let mounted = false
    let onEntryInit: ((entry: typeof entry) => void) | undefined
    let onToolPreExecute: ((
      exec: { name: string },
      next: () => Promise<{ kind: 'allow' }>,
    ) => Promise<{ kind: 'allow' }>) | undefined
    const update = vi.fn(async (_id: string, options: { disabled?: boolean }) => {
      entry.options = { ...entry.options, ...options }
    })
    const watch = vi.fn(() => () => {})
    const onboarding = {
      sync: vi.fn(),
      dispose: vi.fn(),
    }
    const ctx = {
      settings: {
        register: vi.fn(() => ({
          get: () => ({ enabled: true }),
          watch,
        })),
      },
      loader: {
        locate: vi.fn(() => 'include:deepdeck-computer-use'),
        resolve: vi.fn(() => {
          if (!mounted) throw new Error('not mounted')
          return entry
        }),
        update,
      },
      provide: vi.fn(),
      effect: vi.fn((factory: () => unknown) => factory()),
      on: vi.fn((event: string, listener: never) => {
        if (event === 'loader/entry-init') {
          onEntryInit = listener as (next: typeof entry) => void
        }
        if (event === 'tools/pre-execute') {
          onToolPreExecute = listener as typeof onToolPreExecute
        }
        return () => {}
      }),
      root: { logger: undefined },
    }

    await apply(ctx as never, onboarding)

    expect(ctx.on).toHaveBeenCalledWith(
      'loader/entry-init',
      expect.any(Function),
      { global: true },
    )
    onEntryInit?.(entry)
    entry.options.id = COMPUTER_USE_MCP_ENTRY_ID
    mounted = true

    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        'include:deepdeck-computer-use-mcp',
        { disabled: false },
      )
    })
    expect(entry.options.disabled).toBe(false)
    expect(onboarding.sync).not.toHaveBeenCalled()

    const next = vi.fn(async () => ({ kind: 'allow' as const }))
    await onToolPreExecute?.(
      { name: 'mcp__another-server__get_app_state' },
      next,
    )
    expect(onboarding.sync).not.toHaveBeenCalled()

    await onToolPreExecute?.(
      { name: 'mcp__open-computer-use__get_app_state' },
      next,
    )
    expect(onboarding.sync).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ enabled: true }),
    )
    expect(next).toHaveBeenCalledTimes(2)
  })
})

describe('ComputerUsePermissionOnboarding', () => {
  const runtime = {
    enabled: true,
    root: '/runtime/computer-use',
    launcher: '/runtime/computer-use/bin/open-computer-use',
  }

  function fakeChild(): ChildProcess {
    const child = new EventEmitter() as ChildProcess
    Object.assign(child, {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    })
    return child
  }

  it('runs doctor once per enabled period on macOS', () => {
    const child = fakeChild()
    const spawnProcess = vi.fn(() => child)
    const onboarding = new ComputerUsePermissionOnboarding(
      spawnProcess,
      'darwin',
    )

    onboarding.sync(true, runtime)
    onboarding.sync(true, runtime)

    expect(spawnProcess).toHaveBeenCalledOnce()
    expect(spawnProcess).toHaveBeenCalledWith(
      process.execPath,
      [runtime.launcher, 'doctor'],
      {
        cwd: runtime.root,
        stdio: 'ignore',
        windowsHide: true,
      },
    )

    child.emit('exit', 0, null)
    onboarding.sync(true, runtime)
    expect(spawnProcess).toHaveBeenCalledOnce()

    onboarding.sync(false, runtime)
    onboarding.sync(true, runtime)
    expect(spawnProcess).toHaveBeenCalledTimes(2)
  })

  it('does not run macOS onboarding on other platforms', () => {
    const spawnProcess = vi.fn(() => fakeChild())
    const onboarding = new ComputerUsePermissionOnboarding(
      spawnProcess,
      'win32',
    )

    onboarding.sync(true, runtime)

    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('stops an in-flight permission check when disabled', () => {
    const child = fakeChild()
    const onboarding = new ComputerUsePermissionOnboarding(
      vi.fn(() => child),
      'darwin',
    )

    onboarding.sync(true, runtime)
    onboarding.sync(false, runtime)

    expect(child.kill).toHaveBeenCalledOnce()
  })
})
