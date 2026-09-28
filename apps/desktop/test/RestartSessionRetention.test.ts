import { expect, it, vi } from 'vitest'
import { recoverRestartSessions, type RestartContinuityRuntime } from '../../../plugins/desktop-chrome/src/client/restart-continuity.ts'
import type { DesktopRestartBridge } from '../../../plugins/desktop-chrome/src/client/restart-runtime.ts'

it.each([false, true])('retains a restarted session until its queued continuation settles (failure=%s)', async failure => {
  let settle!: () => void
  const pending = new Promise<void>(resolve => { settle = resolve })
  const release = vi.fn()
  const prompt = vi.fn(async () => {
    expect(release).not.toHaveBeenCalled()
    await pending
    if (failure) throw new Error('disconnected')
    return { ok: true }
  })
  const retain = vi.fn(() => ({ ready: Promise.resolve({ session: { prompt } }), release }))
  const runtime: RestartContinuityRuntime = {
    sessions: { list: { getSnapshot: () => ({ phase: 'ready', byId: { session: { running: false } } }), subscribe: () => () => {} }, retain },
    remote: { fileReferences: { list: vi.fn() } },
  }
  const acknowledgeRestartRecovery = vi.fn(async () => true)
  const bridge = { acknowledgeRestartRecovery } as unknown as DesktopRestartBridge
  const recovery = recoverRestartSessions(runtime, bridge, { recoveryId: 'restart', sessions: [{ sessionId: 'session', continuation: true }] })
  const assertion = failure ? expect(recovery).rejects.toThrow('disconnected') : expect(recovery).resolves.toEqual(['session'])
  await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  expect(retain).toHaveBeenCalledWith('session', expect.objectContaining({ source: 'workspaceOperation' }))
  expect(release).not.toHaveBeenCalled()
  settle()
  await assertion
  expect(release).toHaveBeenCalledOnce()
  if (failure) expect(acknowledgeRestartRecovery).not.toHaveBeenCalled()
  else expect(acknowledgeRestartRecovery).toHaveBeenCalledWith('restart', ['session'])
})
