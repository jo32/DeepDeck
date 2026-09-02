import { describe, expect, it, vi } from 'vitest'
import type { DesktopRestartBridge, RestartRecoverySnapshot } from './restart-runtime.ts'
import { recoverRestartSessions, type RestartContinuityRuntime } from './restart-continuity.ts'

function bridge(acknowledge = vi.fn(async () => true)): DesktopRestartBridge {
  return {
    pendingRestart: vi.fn(async () => undefined),
    decideRestart: vi.fn(async () => true),
    onRestartRequested: vi.fn(() => () => {}),
    restartRecovery: vi.fn(async () => undefined),
    acknowledgeRestartRecovery: acknowledge,
  }
}

describe('restart Session continuity', () => {
  it('queues one continuation without replaying the existing pending Queue', async () => {
    const prompt = vi.fn(async () => ({ ok: true }))
    const acknowledge = vi.fn(async () => true)
    const runtime: RestartContinuityRuntime = {
      sessions: {
        list: {
          getSnapshot: () => ({ phase: 'ready', byId: { running: { running: false } } }),
          subscribe: () => () => {},
        },
        binding: () => ({ session: { prompt } }),
      },
      connection: { api: { sessions: { models: vi.fn() } } },
    }
    const recovery: RestartRecoverySnapshot = {
      recoveryId: 'restart-1',
      sessions: [{ sessionId: 'running', continuation: true }],
    }

    await expect(recoverRestartSessions(runtime, bridge(acknowledge), recovery))
      .resolves.toEqual(['running'])
    expect(prompt).toHaveBeenCalledOnce()
    expect(prompt.mock.calls[0]?.[1]).toBe('queue')
    expect(acknowledge).toHaveBeenCalledWith('restart-1', ['running'])
  })

  it('cold-restores a pending interaction without adding a continuation message', async () => {
    const prompt = vi.fn()
    const models = vi.fn(async () => ({ result: { ok: true } }))
    const runtime: RestartContinuityRuntime = {
      sessions: {
        list: {
          getSnapshot: () => ({ phase: 'ready', byId: { waiting: { running: false } } }),
          subscribe: () => () => {},
        },
        binding: () => ({ session: { prompt } }),
      },
      connection: { api: { sessions: { models } } },
    }

    await recoverRestartSessions(runtime, bridge(), {
      recoveryId: 'restart-2',
      sessions: [{ sessionId: 'waiting', continuation: false }],
    })

    expect(models).toHaveBeenCalledWith({ sessionId: 'waiting' }, undefined)
    expect(prompt).not.toHaveBeenCalled()
  })
})
