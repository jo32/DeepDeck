import { randomUUID } from 'node:crypto'
import type {
  AppConversationActionEffect,
  AppConversationActionToolDefinition,
  AppConversationHostRegistry,
} from './contracts.js'

interface ActionSession {
  readonly id: string
  readonly header: { readonly cwd?: string }
}

interface ActionScopedContext {
  readonly tools: { register(definition: ActionToolDefinition): () => void }
}

interface ActionAgent {
  readonly id: string
  readonly ctx: ActionScopedContext
  readonly session: ActionSession
}

interface ActionToolExecution {
  readonly agent?: ActionAgent
  readonly signal: AbortSignal
}

interface ActionToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: AppConversationActionToolDefinition['parameters']
  readonly output: {
    readonly schema: { readonly type: 'string' }
    render(args: unknown, value: string): readonly { readonly type: 'text'; readonly text: string }[]
  }
  execute(args: unknown, exec: ActionToolExecution): Promise<string>
}

interface ActionToolHostContext {
  readonly agents: { get(sessionId: string): ActionAgent | undefined }
  on(event: 'agent/disposed', listener: (payload: { readonly agent: ActionAgent }) => void): () => void
  on(
    event: 'session/event',
    listener: (session: ActionSession, event: { readonly type: string }) => void,
  ): () => void
}

export interface AppActionBeginRequest {
  readonly sessionId: string
  readonly appId: string
  readonly toolNames: readonly string[]
}

export interface AppActionBeginResult {
  readonly executionId: string
  readonly sessionId: string
  readonly appId: string
  readonly tools: readonly string[]
}

export interface AppActionEffectPage {
  readonly executionId: string
  readonly effects: readonly AppConversationActionEffect[]
}

export interface AppActionToolRuntime {
  begin(request: AppActionBeginRequest): AppActionBeginResult
  read(executionId: string, afterSequence: number): AppActionEffectPage
  finish(executionId: string): void
  dispose(): void
}

interface ActiveAction {
  readonly executionId: string
  readonly sessionId: string
  readonly appId: string
  readonly agent: ActionAgent
  readonly tools: readonly string[]
  readonly disposers: (() => void)[]
  readonly effects: AppConversationActionEffect[]
  sequence: number
  active: boolean
  cleanupTimer?: ReturnType<typeof setTimeout>
}

const MAX_EFFECT_BYTES = 64 * 1024
const STRING_OUTPUT = {
  schema: { type: 'string' } as const,
  render(_args: unknown, value: string) {
    return [{ type: 'text' as const, text: value }]
  },
}

function effectPayload(value: unknown): unknown {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('App action tool arguments must be JSON serializable.')
  if (Buffer.byteLength(serialized) > MAX_EFFECT_BYTES) {
    throw new Error('App action tool payload exceeds 64 KiB.')
  }
  return JSON.parse(serialized) as unknown
}

/** Mount declarative App UI tools only for the lifetime of one dispatched action. */
export function installAppActionTools(
  ctx: ActionToolHostContext,
  registry: Pick<AppConversationHostRegistry, 'actionTools'>,
): AppActionToolRuntime {
  const byExecution = new Map<string, ActiveAction>()
  const bySession = new Map<string, ActiveAction>()

  const deactivateState = (state: ActiveAction): void => {
    if (!state.active) return
    state.active = false
    if (bySession.get(state.sessionId) === state) bySession.delete(state.sessionId)
    for (const dispose of state.disposers.reverse()) dispose()
    state.cleanupTimer = setTimeout(() => finishState(state), 60_000)
    state.cleanupTimer.unref?.()
  }

  const finishState = (state: ActiveAction): void => {
    if (byExecution.get(state.executionId) !== state) return
    deactivateState(state)
    if (state.cleanupTimer !== undefined) clearTimeout(state.cleanupTimer)
    byExecution.delete(state.executionId)
  }

  const begin = (request: AppActionBeginRequest): AppActionBeginResult => {
    if (bySession.has(request.sessionId)) {
      throw new Error('This App Session already has an active dispatched action.')
    }
    const agent = ctx.agents.get(request.sessionId)
    if (agent === undefined) throw new Error('The App Agent is not active.')
    const cwd = agent.session.header.cwd?.trim()
    if (cwd === undefined || cwd.length === 0) throw new Error('The App Agent has no Workspace.')
    const definitions = registry.actionTools(request.appId, cwd, request.toolNames)
    if (definitions.length === 0) throw new Error('A dispatched App action must enable at least one tool.')

    const state: ActiveAction = {
      executionId: randomUUID(),
      sessionId: request.sessionId,
      appId: request.appId,
      agent,
      tools: definitions.map(definition => definition.name),
      disposers: [],
      effects: [],
      sequence: 0,
      active: true,
    }
    byExecution.set(state.executionId, state)
    bySession.set(state.sessionId, state)
    try {
      for (const definition of definitions) {
        state.disposers.push(agent.ctx.tools.register({
          name: definition.name,
          description: definition.description,
          parameters: definition.parameters,
          output: STRING_OUTPUT,
          async execute(args, exec) {
            exec.signal.throwIfAborted()
            if (!state.active || exec.agent !== state.agent || byExecution.get(state.executionId) !== state) {
              throw new Error('This App action tool is no longer bound to the active Agent action.')
            }
            const effect: AppConversationActionEffect = Object.freeze({
              sequence: ++state.sequence,
              effectId: randomUUID(),
              toolName: definition.name,
              effect: definition.effect,
              payload: effectPayload(args),
              createdAt: new Date().toISOString(),
            })
            state.effects.push(effect)
            return JSON.stringify({
              delivered: true,
              effectId: effect.effectId,
              effect: effect.effect,
            })
          },
        }))
      }
    } catch (error) {
      finishState(state)
      throw error
    }
    return Object.freeze({
      executionId: state.executionId,
      sessionId: state.sessionId,
      appId: state.appId,
      tools: state.tools,
    })
  }

  const read = (executionId: string, afterSequence: number): AppActionEffectPage => {
    const state = byExecution.get(executionId)
    if (state === undefined) throw new Error('Unknown or completed App action execution.')
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error('App action effect cursor must be a non-negative integer.')
    }
    return Object.freeze({
      executionId,
      effects: state.effects.filter(effect => effect.sequence > afterSequence),
    })
  }

  const finish = (executionId: string): void => {
    const state = byExecution.get(executionId)
    if (state !== undefined) finishState(state)
  }

  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => {
    const state = bySession.get(agent.session.id)
    if (state !== undefined && state.agent === agent) finishState(state)
  })
  const stopSessionEvent = ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const state = bySession.get(session.id)
    if (state !== undefined) deactivateState(state)
  })
  const dispose = (): void => {
    stopSessionEvent()
    stopDisposed()
    for (const state of [...byExecution.values()]) finishState(state)
  }
  return { begin, read, finish, dispose }
}
