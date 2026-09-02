import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { DesktopRestartBridge, RestartRecoverySnapshot } from './restart-runtime.ts'
import { desktopRestartBridge } from './restart-runtime.ts'

const CONTINUATION_PROMPT = 'DeepDeck 已完成重启。请从上一轮已持久化的进度继续未完成的任务，不要重复已经完成的工作。'

interface SessionListSnapshot {
  readonly phase: 'pending' | 'ready'
  readonly byId: Readonly<Record<string, { readonly running: boolean } | undefined>>
}

export interface RestartContinuityRuntime {
  readonly sessions: {
    readonly list: {
      getSnapshot: () => SessionListSnapshot
      subscribe: (listener: () => void) => () => void
    }
    binding: (sessionId: SessionId) => undefined | {
      readonly session: {
        prompt: (
          content: Array<{ readonly type: 'text'; readonly text: string }>,
          mode: 'queue',
          signal?: AbortSignal,
        ) => Promise<{ readonly ok: boolean }>
      }
    }
  }
  readonly connection: {
    readonly api: {
      readonly sessions: {
        models: (
          request: { readonly sessionId: SessionId },
          signal?: AbortSignal,
        ) => Promise<{ readonly result: { readonly ok: boolean } }>
      }
    }
  }
}

async function waitForSessionList(runtime: RestartContinuityRuntime, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  if (runtime.sessions.list.getSnapshot().phase === 'ready') return
  await new Promise<void>((resolve, reject) => {
    let stop = (): void => {}
    const finish = (error?: Error) => {
      stop()
      signal?.removeEventListener('abort', aborted)
      if (error === undefined) resolve()
      else reject(error)
    }
    const check = () => {
      if (runtime.sessions.list.getSnapshot().phase === 'ready') finish()
    }
    const aborted = () => finish(new DOMException('Restart recovery was aborted', 'AbortError'))
    stop = runtime.sessions.list.subscribe(check)
    signal?.addEventListener('abort', aborted, { once: true })
    check()
  })
}

/** Activate waiting Sessions and append one wake-up behind each durable pending Queue. */
export async function recoverRestartSessions(
  runtime: RestartContinuityRuntime,
  bridge: DesktopRestartBridge,
  recovery: RestartRecoverySnapshot,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  await waitForSessionList(runtime, signal)
  signal?.throwIfAborted()
  const completed = await Promise.all(recovery.sessions.map(async (entry): Promise<string | undefined> => {
    signal?.throwIfAborted()
    const summary = runtime.sessions.list.getSnapshot().byId[entry.sessionId]
    if (summary === undefined || summary.running) return entry.sessionId
    const sessionId = entry.sessionId as SessionId
    if (!entry.continuation) {
      const result = await runtime.connection.api.sessions.models({ sessionId }, signal)
      return result.result.ok ? entry.sessionId : undefined
    }
    const binding = runtime.sessions.binding(sessionId)
    if (binding === undefined) return undefined
    const result = await binding.session.prompt(
      [{ type: 'text', text: CONTINUATION_PROMPT }],
      'queue',
      signal,
    )
    return result.ok ? entry.sessionId : undefined
  }))
  const acknowledged = completed.filter((sessionId): sessionId is string => sessionId !== undefined)
  if (acknowledged.length > 0 || recovery.sessions.length === 0) {
    await bridge.acknowledgeRestartRecovery(recovery.recoveryId, acknowledged)
  }
  return acknowledged
}

export function installRestartContinuity(runtime: RestartContinuityRuntime): () => void {
  const bridge = desktopRestartBridge()
  if (bridge === undefined) return () => {}
  const controller = new AbortController()
  void bridge.restartRecovery()
    .then(async recovery => {
      if (recovery === undefined || controller.signal.aborted) return
      await recoverRestartSessions(runtime, bridge, recovery, controller.signal)
    })
    .catch((error: unknown) => {
      if (!controller.signal.aborted) console.error('DeepDeck could not restore restarted Sessions', error)
    })
  return () => { controller.abort() }
}
