import { randomUUID } from 'node:crypto'
import type {
  AppConversationActionEffect,
  AppConversationActionToolDefinition,
  AppConversationHostRegistry,
} from './contracts.js'

interface ActionSession {
  readonly id: string
  readonly header: { readonly cwd?: string }
  readonly events: readonly ActionSessionEvent[]
  append(type: typeof APP_ACTION_BINDING_EVENT, data: AppActionBindingEvent): unknown
}

interface ActionSessionEvent {
  readonly type: string
  readonly data: unknown
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
  readonly sessions: { flush(session: ActionSession): Promise<boolean> }
  readonly logger?: { warn(message: string): void }
  on(
    event: 'agent/created' | 'agent/disposed',
    listener: (payload: { readonly agent: ActionAgent }) => void,
  ): () => void
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
  begin(request: AppActionBeginRequest): Promise<AppActionBeginResult>
  read(executionId: string, afterSequence: number): AppActionEffectPage
  finish(executionId: string): void
  dispose(): void
}

export const APP_ACTION_BINDING_EVENT = 'deepdeck/app-action-binding' as const

export interface AppActionBindingEvent {
  readonly appId: string
  readonly toolNames: readonly string[]
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
}

interface AppActionToolRegistry extends Pick<AppConversationHostRegistry, 'actionTools'> {
  legacyActionToolBinding?(
    cwd: string,
    requestToolNames: readonly string[],
  ): AppActionBindingEvent | undefined
}

const MAX_EFFECT_BYTES = 64 * 1024
const MAX_BUFFERED_EFFECTS = 256
const MAX_ACTION_TOOLS = 16
const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const ACTION_TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
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

function bindingEvent(value: unknown): AppActionBindingEvent | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const binding = value as Partial<AppActionBindingEvent>
  if (
    typeof binding.appId !== 'string'
    || !APP_ID_PATTERN.test(binding.appId)
    || !Array.isArray(binding.toolNames)
    || binding.toolNames.length === 0
    || binding.toolNames.length > MAX_ACTION_TOOLS
    || !binding.toolNames.every(name => typeof name === 'string' && ACTION_TOOL_NAME_PATTERN.test(name))
    || new Set(binding.toolNames).size !== binding.toolNames.length
  ) return undefined
  return Object.freeze({ appId: binding.appId, toolNames: [...binding.toolNames] })
}

/** Fold the last valid App tool binding from the durable Session event log. */
export function foldAppActionBinding(events: readonly ActionSessionEvent[]): AppActionBindingEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== APP_ACTION_BINDING_EVENT) continue
    return bindingEvent(event.data)
  }
  return undefined
}

function requestHeaderToolNames(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const header = (value as { readonly header?: unknown }).header
  if (typeof header !== 'object' || header === null || Array.isArray(header)) return []
  const tools = (header as { readonly tools?: unknown }).tools
  if (!Array.isArray(tools)) return []
  return tools.flatMap(tool => (
    typeof tool === 'object'
    && tool !== null
    && !Array.isArray(tool)
    && typeof (tool as { readonly name?: unknown }).name === 'string'
      ? [(tool as { readonly name: string }).name]
      : []
  ))
}

function legacyAppActionBinding(
  agent: ActionAgent,
  registry: AppActionToolRegistry,
): AppActionBindingEvent | undefined {
  const resolve = registry.legacyActionToolBinding
  const cwd = agent.session.header.cwd?.trim()
  if (resolve === undefined || cwd === undefined || cwd.length === 0) return undefined
  for (let index = agent.session.events.length - 1; index >= 0; index -= 1) {
    const event = agent.session.events[index]
    if (event?.type !== 'request/header') continue
    const names = requestHeaderToolNames(event.data)
    if (names.length === 0) continue
    const binding = bindingEvent(resolve.call(registry, cwd, names))
    if (binding !== undefined) return binding
  }
  return undefined
}

/** Mount declarative App UI tools for the App Session that dispatched them. */
export function installAppActionTools(
  ctx: ActionToolHostContext,
  registry: AppActionToolRegistry,
): AppActionToolRuntime {
  const byExecution = new Map<string, ActiveAction>()
  const bySession = new Map<string, ActiveAction>()

  const finishState = (state: ActiveAction): void => {
    if (byExecution.get(state.executionId) !== state) return
    state.active = false
    if (bySession.get(state.sessionId) === state) bySession.delete(state.sessionId)
    for (const dispose of state.disposers.reverse()) dispose()
    byExecution.delete(state.executionId)
  }

  const resultFor = (state: ActiveAction): AppActionBeginResult => Object.freeze({
    executionId: state.executionId,
    sessionId: state.sessionId,
    appId: state.appId,
    tools: state.tools,
  })

  const definitionsFor = (
    agent: ActionAgent,
    binding: AppActionBindingEvent,
  ): readonly AppConversationActionToolDefinition[] => {
    const cwd = agent.session.header.cwd?.trim()
    if (cwd === undefined || cwd.length === 0) throw new Error('The App Agent has no Workspace.')
    const definitions = registry.actionTools(binding.appId, cwd, binding.toolNames)
    if (definitions.length === 0) throw new Error('A dispatched App action must enable at least one tool.')
    return definitions
  }

  const attach = (
    agent: ActionAgent,
    binding: AppActionBindingEvent,
    definitions = definitionsFor(agent, binding),
  ): ActiveAction => {
    const tools = definitions.map(definition => definition.name)
    const existing = bySession.get(agent.session.id)
    if (existing !== undefined) {
      if (
        existing.agent === agent
        && existing.appId === binding.appId
        && existing.tools.length === tools.length
        && existing.tools.every((tool, index) => tool === tools[index])
      ) return existing
      throw new Error('This App Session is already bound to different App action tools.')
    }

    const state: ActiveAction = {
      executionId: randomUUID(),
      sessionId: agent.session.id,
      appId: binding.appId,
      agent,
      tools,
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
              throw new Error('This App action tool is no longer bound to the active App Session.')
            }
            if (state.effects.length >= MAX_BUFFERED_EFFECTS) {
              throw new Error('The App effect consumer is unavailable or has fallen behind.')
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
    return state
  }

  const sync = (agent: ActionAgent): void => {
    const durable = foldAppActionBinding(agent.session.events)
    const binding = durable ?? legacyAppActionBinding(agent, registry)
    if (binding === undefined) return
    const existing = bySession.get(agent.session.id)
    if (existing !== undefined && existing.agent !== agent) finishState(existing)
    try {
      attach(agent, binding)
      if (durable === undefined) {
        // One-time migration for Sessions created before App bindings became
        // explicit events. Registration is synchronous so this tool is part of
        // the immediately following request/header; durability finishes in the
        // background and will be retried from history after a failed restart.
        agent.session.append(APP_ACTION_BINDING_EVENT, binding)
        void ctx.sessions.flush(agent.session).then((flushed) => {
          if (!flushed) ctx.logger?.warn('deepdeck could not durably migrate legacy App Session tools')
        }).catch((error: unknown) => {
          ctx.logger?.warn(`deepdeck could not durably migrate legacy App Session tools: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    } catch (error) {
      ctx.logger?.warn(`deepdeck could not restore App Session tools: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const begin = async (request: AppActionBeginRequest): Promise<AppActionBeginResult> => {
    const agent = ctx.agents.get(request.sessionId)
    if (agent === undefined) throw new Error('The App Agent is not active.')
    const requested = bindingEvent({ appId: request.appId, toolNames: request.toolNames })
    if (requested === undefined) throw new Error('The App action tool binding is invalid.')

    const existing = bySession.get(request.sessionId)
    if (existing !== undefined) {
      if (
        existing.agent === agent
        && existing.appId === requested.appId
        && existing.tools.length === requested.toolNames.length
        && existing.tools.every((tool, index) => tool === requested.toolNames[index])
      ) return resultFor(existing)
      throw new Error('This App Session is already bound to different App action tools.')
    }

    const durable = foldAppActionBinding(agent.session.events)
    if (
      durable !== undefined
      && durable.appId === requested.appId
      && durable.toolNames.length === requested.toolNames.length
      && durable.toolNames.every((tool, index) => tool === requested.toolNames[index])
    ) return resultFor(attach(agent, durable))

    // The binding must reach the Session log before the prompt can start. A
    // recreated Agent folds this event and mounts the same tools before its
    // next request/header is assembled.
    const definitions = definitionsFor(agent, requested)
    agent.session.append(APP_ACTION_BINDING_EVENT, requested)
    const state = attach(agent, requested, definitions)
    try {
      if (!await ctx.sessions.flush(agent.session)) {
        throw new Error('The App Session tool binding could not be durably flushed.')
      }
    } catch (error) {
      finishState(state)
      throw error
    }
    return resultFor(state)
  }

  const read = (executionId: string, afterSequence: number): AppActionEffectPage => {
    const state = byExecution.get(executionId)
    if (state === undefined) throw new Error('Unknown or completed App action execution.')
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error('App action effect cursor must be a non-negative integer.')
    }
    while (state.effects[0] !== undefined && state.effects[0].sequence <= afterSequence) {
      state.effects.shift()
    }
    return Object.freeze({
      executionId,
      effects: [...state.effects],
    })
  }

  const finish = (executionId: string): void => {
    const state = byExecution.get(executionId)
    if (state !== undefined) finishState(state)
  }

  const stopCreated = ctx.on('agent/created', ({ agent }) => { sync(agent) })
  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => {
    const state = bySession.get(agent.session.id)
    if (state !== undefined && state.agent === agent) finishState(state)
  })
  const stopSessionEvent = ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/start') return
    const agent = ctx.agents.get(session.id)
    if (agent !== undefined) sync(agent)
  })
  const dispose = (): void => {
    stopSessionEvent()
    stopDisposed()
    stopCreated()
    for (const state of [...byExecution.values()]) finishState(state)
  }
  return { begin, read, finish, dispose }
}
