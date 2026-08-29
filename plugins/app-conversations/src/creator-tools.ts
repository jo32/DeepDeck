import { randomUUID } from 'node:crypto'
import type {
  AppApplyResult,
  AppConversationHostRegistry,
  AppCreatorContext,
  AppCreatorReadyResult,
  AppRebuildResult,
  AppRestartResult,
} from './contracts.js'
import { APP_CREATOR_PROTOCOL_VERSION } from './contracts.js'
import {
  changedWorkspaceFiles,
  requiresRuntimeRestart,
  snapshotAppWorkspace,
  type AppWorkspaceSnapshot,
} from './creator-state.js'
import {
  DEEPDECK_VIBE_APP_SKILL,
  DEEPDECK_VIBE_APP_SKILL_NAME,
  type CreatorSkillRegistration,
} from './creator-skill.js'

interface CreatorSession {
  readonly id: string
  readonly header: { readonly cwd?: string }
}

interface CreatorModeScopedContext {
  readonly tools: { register(definition: CreatorToolDefinition): () => void }
  readonly skills: { register(definition: CreatorSkillRegistration): () => void }
  readonly systemPrompt: {
    section(definition: { readonly name: string; readonly order: number; readonly text: string }): () => void
  }
  on(
    event: 'agent/pre-step',
    listener: (
      payload: { readonly agent: CreatorAgent; readonly turn: number; readonly signal: AbortSignal },
      next: () => Promise<unknown>,
    ) => Promise<unknown>,
  ): () => void
  on(
    event: 'agent/turn-stopping',
    listener: (payload: { readonly agent: CreatorAgent; readonly turn: number; readonly signal: AbortSignal }) => Promise<void>,
  ): () => void
}

interface CreatorAgent {
  readonly id: string
  readonly ctx: CreatorModeScopedContext
  readonly session: CreatorSession
  steer(message: CreatorSteerMessage): void
}

interface CreatorSteerMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  readonly source: { readonly kind: 'plugin'; readonly plugin: string }
}

interface CreatorToolExecution {
  readonly agent?: CreatorAgent
  readonly signal: AbortSignal
}

interface CreatorToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: {
    readonly type: 'object'
    readonly additionalProperties: false
    readonly properties: Record<string, never>
  }
  readonly output: {
    readonly schema: { readonly type: 'string' }
    render(args: unknown, value: string): readonly { readonly type: 'text'; readonly text: string }[]
  }
  execute(args: unknown, exec: CreatorToolExecution): Promise<string>
}

interface CreatorModeHostContext {
  readonly agents: { get(sessionId: string): CreatorAgent | undefined }
  readonly agentPresets: { composedPreset(agentContext: CreatorModeScopedContext): string | undefined }
  readonly sessions: { flush(session: CreatorSession): Promise<boolean> }
  readonly logger: { warn(message: string): void }
  on(
    event: 'agent/created' | 'agent/disposed',
    listener: (payload: { readonly agent: CreatorAgent }) => void,
  ): () => void
  on(
    event: 'agent-preset/selected',
    listener: (sessionId: string, agentPreset: string) => void,
  ): () => void
  on(
    event: 'session/event',
    listener: (session: CreatorSession, event: { readonly type: string }) => void,
  ): () => void
}

interface CreatorToolOperations {
  context(exec: CreatorToolExecution): Promise<AppCreatorContext>
  apply(exec: CreatorToolExecution): Promise<AppApplyResult>
  restart(exec: CreatorToolExecution): Promise<AppRestartResult>
}

interface CreatorAgentState {
  readonly agent: CreatorAgent
  readonly cwd: string
  context?: AppCreatorContext
  turn?: number
  turnBaseline?: AppWorkspaceSnapshot
  failedDigest?: string
  guardFailure?: string
  pendingRestart: boolean
  restartDispatchStarted: boolean
  steeredDigest?: string
}

const EMPTY_PARAMETERS = { type: 'object', additionalProperties: false, properties: {} } as const
const STRING_OUTPUT = {
  schema: { type: 'string' } as const,
  render(_args: unknown, value: string) {
    return [{ type: 'text' as const, text: value }]
  },
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function creatorSteerMessage(text: string): CreatorSteerMessage {
  return Object.freeze({
    id: randomUUID(),
    role: 'user' as const,
    content: Object.freeze([Object.freeze({ type: 'text' as const, text })] as const),
    source: Object.freeze({ kind: 'plugin' as const, plugin: 'deepdeck-app-apply-guard' }),
  })
}

function creatorWorkspace(exec: CreatorToolExecution): string {
  const cwd = exec.agent?.session.header.cwd?.trim()
  if (cwd === undefined || cwd.length === 0) {
    throw new Error('This Creator session is not attached to a Workspace.')
  }
  return cwd
}

function renderContext(context: AppCreatorContext): string {
  return JSON.stringify({
    appId: context.appId,
    title: context.title,
    packageName: context.packageName,
    sourcePackageRoot: context.sourcePackageRoot,
    rebuildAvailable: context.rebuildAvailable,
    ...(context.rebuildReason === undefined ? {} : { rebuildReason: context.rebuildReason }),
    applyState: context.applyState,
  }, null, 2)
}

function applyFromRebuild(result: AppRebuildResult, changedFiles: readonly string[]): AppApplyResult {
  return Object.freeze({
    appId: result.appId,
    packageName: result.packageName,
    applyId: result.applyId,
    sourceDigest: result.sourceDigest,
    outputRevision: result.outputRevision,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    outcome: 'hot-reloaded',
    buildSucceeded: true,
    hostReloaded: result.hostReloaded,
    hostRuntime: result.hostRuntime,
    clientReload: result.clientReload,
    clientRuntime: result.clientRuntime,
    appWindowsMatched: result.appWindowsMatched,
    appWindowsReloaded: result.appWindowsReloaded,
    appWindowsFailed: result.appWindowsFailed,
    ...(result.appWindowsReloadError === undefined ? {} : { appWindowsReloadError: result.appWindowsReloadError }),
    runtimeRestart: 'not-required',
    userActionRequired: result.userActionRequired,
    changedFiles,
    buildLog: result.buildLog,
  })
}

function renderApply(result: AppApplyResult): string {
  return JSON.stringify(result, null, 2)
}

function renderRestart(result: AppRestartResult): string {
  return JSON.stringify({
    appId: result.appId,
    packageName: result.packageName,
    restartScheduled: result.restartScheduled,
    message: 'DeepDeck will restart the Harness runtime after this Agent turn is durably saved. The desktop window reconnects automatically.',
  }, null, 2)
}

function defaultOperations(registry: AppConversationHostRegistry): CreatorToolOperations {
  return {
    context: async exec => await registry.creatorContext(creatorWorkspace(exec), exec.signal),
    apply: async (exec) => {
      const result = await registry.rebuildCreator(creatorWorkspace(exec), exec.signal)
      return applyFromRebuild(result, [])
    },
    restart: async exec => await registry.restartCreator(creatorWorkspace(exec), exec.signal),
  }
}

/** Creator-only tools. Registration scope, not caller-supplied paths, controls visibility. */
export function appCreatorToolDefinitions(
  registry: AppConversationHostRegistry,
  operations: CreatorToolOperations = defaultOperations(registry),
): readonly CreatorToolDefinition[] {
  return [
    {
      name: 'deepdeck_app_context',
      description: 'Inspect the DeepDeck App bound to this Creator session, including its trusted source package and apply availability.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderContext(await operations.context(exec))
      },
    },
    {
      name: 'deepdeck_app_apply',
      description: 'Authoritatively build and apply the bound App. It hot-reloads ordinary source changes, queues a full runtime restart for structural changes, and reports each observed surface separately. Call after source edits; do not run a duplicate build first.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderApply(await operations.apply(exec))
      },
    },
    {
      name: 'deepdeck_app_rebuild',
      description: 'Compatibility alias for deepdeck_app_apply. Build and apply the bound App instead of running its build command manually.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderApply(await operations.apply(exec))
      },
    },
    {
      name: 'deepdeck_app_restart',
      description: 'Validate the bound App and queue a full DeepDeck Harness restart after the current Agent turn has been durably saved. Use for an explicit full restart; deepdeck_app_apply selects this automatically for structural changes.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderRestart(await operations.restart(exec))
      },
    },
  ]
}

/** Install App tools and the deterministic apply guard into every source-bound Agent. */
export function installAppCreatorMode(
  ctx: CreatorModeHostContext,
  registry: AppConversationHostRegistry,
): (() => void) & {
  assertReady(sessionId: string, appId: string, signal?: AbortSignal): Promise<AppCreatorReadyResult>
} {
  const registrations = new Set<() => void>()
  const agents = new WeakMap<object, () => void>()
  const states = new WeakMap<object, CreatorAgentState>()
  const sessions = new WeakMap<object, CreatorAgentState>()

  const ensureBound = async (state: CreatorAgentState, signal?: AbortSignal): Promise<AppCreatorContext> => {
    if (state.cwd.length === 0) throw new Error('This Creator session is not attached to a Workspace.')
    state.context ??= await registry.creatorContext(state.cwd, signal)
    return state.context
  }

  const applyState = async (state: CreatorAgentState, signal?: AbortSignal): Promise<AppApplyResult> => {
    await ensureBound(state, signal)
    const before = await snapshotAppWorkspace(state.cwd, signal)
    const persistedChanges = await registry.changedFilesSinceApply(
      state.cwd,
      Object.fromEntries(before.files),
      signal,
    )
    const changedFiles = persistedChanges
      ?? changedWorkspaceFiles(state.turnBaseline ?? before, before)
    try {
      let result: AppApplyResult
      if (requiresRuntimeRestart(changedFiles)) {
        const validation = await registry.validateCreator(state.cwd, signal)
        result = Object.freeze({
          appId: validation.appId,
          packageName: validation.packageName,
          applyId: validation.applyId,
          sourceDigest: validation.sourceDigest,
          outputRevision: validation.outputRevision,
          completedAt: validation.completedAt,
          durationMs: validation.durationMs,
          outcome: 'restart-queued',
          buildSucceeded: true,
          hostReloaded: false,
          hostRuntime: 'restart-queued',
          clientReload: 'restart-queued',
          clientRuntime: 'restart-queued',
          appWindowsMatched: 0,
          appWindowsReloaded: 0,
          appWindowsFailed: 0,
          runtimeRestart: 'queued-after-turn-flush',
          userActionRequired: 'restart-pending',
          changedFiles,
          installLog: validation.installLog,
          buildLog: validation.buildLog,
        })
        state.pendingRestart = true
      } else {
        result = applyFromRebuild(await registry.rebuildCreator(state.cwd, signal), changedFiles)
      }
      state.turnBaseline = await snapshotAppWorkspace(state.cwd, signal)
      delete state.failedDigest
      return result
    } catch (error) {
      state.failedDigest = (await snapshotAppWorkspace(state.cwd).catch(() => before)).digest
      throw error
    }
  }

  const queueRestart = async (state: CreatorAgentState, signal?: AbortSignal): Promise<AppRestartResult> => {
    const context = await ensureBound(state, signal)
    const current = await snapshotAppWorkspace(state.cwd, signal)
    const applyState = await registry.applyState(state.cwd, signal)
    const effectiveDigest = applyState.pendingRestartDigest ?? applyState.appliedDigest
    if (effectiveDigest !== current.digest) {
      const validation = await registry.validateCreator(state.cwd, signal)
      state.turnBaseline = await snapshotAppWorkspace(state.cwd, signal)
      state.context = { ...context, packageName: validation.packageName }
    }
    state.pendingRestart = true
    return Object.freeze({
      appId: context.appId,
      packageName: context.packageName,
      restartScheduled: true,
    })
  }

  const operations = (state: CreatorAgentState): CreatorToolOperations => ({
    context: async (exec) => {
      const context = await registry.creatorContext(creatorWorkspace(exec), exec.signal)
      state.context = context
      return context
    },
    apply: async exec => await applyState(state, exec.signal),
    restart: async exec => await queueRestart(state, exec.signal),
  })

  const steer = (agent: CreatorAgent, text: string): void => {
    agent.steer(creatorSteerMessage(text))
  }

  const detach = (agent: CreatorAgent): void => {
    agents.get(agent)?.()
  }

  const attach = (agent: CreatorAgent): void => {
    const cwd = agent.session.header.cwd?.trim()
    if (agents.has(agent) || cwd === undefined || !registry.isCreatorSource(cwd)) return
    const state: CreatorAgentState = {
      agent,
      cwd: cwd ?? '',
      pendingRestart: false,
      restartDispatchStarted: false,
    }
    states.set(agent, state)
    sessions.set(agent.session, state)
    const disposers = appCreatorToolDefinitions(registry, operations(state)).map(
      definition => agent.ctx.tools.register(definition),
    )
    disposers.push(agent.ctx.skills.register(DEEPDECK_VIBE_APP_SKILL))
    disposers.push(agent.ctx.systemPrompt.section({
      name: 'deepdeck:app-creator',
      order: 95,
      text: [
        'This session Workspace is a registered DeepDeck App source package, so the Host enforces the Creator apply lifecycle independently of the selected preset.',
        `Load the ${DEEPDECK_VIBE_APP_SKILL_NAME} Skill before App-specific source work; it contains the architecture, Agent-action, security, and verification guidance for DeepDeck Vibe Apps.`,
        'Call deepdeck_app_context before App-specific work to verify that binding.',
        'After source edits, call deepdeck_app_apply; it is the single authoritative build-and-apply operation, so do not run a duplicate build first.',
        'Ordinary code changes use Cordis hot reload. Structural changes queue a full runtime restart only after the final response is durably saved.',
        'The Host apply guard compares the Workspace before the turn can finish and will continue the turn if changed source has not been applied.',
        'Never claim the running App was updated unless the apply receipt confirms the relevant Host, Client, or App-window runtime surface.',
      ].join(' '),
    }))
    disposers.push(agent.ctx.on('agent/pre-step', async ({ turn, signal }, next) => {
      if (state.turn !== turn) {
        state.turn = turn
        delete state.steeredDigest
        delete state.failedDigest
        delete state.guardFailure
        await ensureBound(state, signal)
        state.turnBaseline = await snapshotAppWorkspace(state.cwd, signal)
      }
      return await next()
    }))
    disposers.push(agent.ctx.on('agent/turn-stopping', async ({ signal }) => {
      let current: AppWorkspaceSnapshot
      let persistedState: Awaited<ReturnType<AppConversationHostRegistry['applyState']>>
      try {
        await ensureBound(state, signal)
        if (state.turnBaseline === undefined) {
          throw new Error('Creator apply guard has no turn baseline.')
        }
        current = await snapshotAppWorkspace(state.cwd, signal)
        persistedState = await registry.applyState(state.cwd, signal)
      } catch (error) {
        const failure = `DeepDeck App apply guard failed closed for ${state.cwd}: ${errorMessage(error)}`
        ctx.logger.warn(failure)
        if (state.guardFailure !== failure) {
          state.guardFailure = failure
          steer(agent, `${failure}. Do not finish or claim the App was updated; repair or report this concrete blocker.`)
          return
        }
        throw new Error(failure)
      }
      const effectiveDigest = persistedState.pendingRestartDigest ?? persistedState.appliedDigest
      const changedThisTurn = current.digest !== state.turnBaseline.digest
      const differsFromApplied = effectiveDigest !== undefined && current.digest !== effectiveDigest
      if (
        (!changedThisTurn && !differsFromApplied)
        || current.digest === state.failedDigest
      ) return
      if (state.steeredDigest !== current.digest) {
        state.steeredDigest = current.digest
        steer(agent, 'DeepDeck detected unapplied changes in this App Workspace. Call deepdeck_app_apply now; it performs the authoritative build and chooses hot reload or a durable post-turn restart. Do not finish with a manual restart instruction.')
        return
      }
      try {
        const result = await applyState(state, signal)
        steer(agent, `DeepDeck applied the pending App changes automatically because the prior apply reminder was not completed. Reflect this verified result in the final response:\n${renderApply(result)}`)
      } catch (error) {
        steer(agent, `DeepDeck could not apply the pending App changes. Report this concrete failure and do not claim the running App was updated: ${errorMessage(error)}`)
      }
    }))

    let active = true
    const stop = () => {
      if (!active) return
      active = false
      registrations.delete(stop)
      agents.delete(agent)
      states.delete(agent)
      sessions.delete(agent.session)
      for (const dispose of disposers.reverse()) dispose()
    }
    registrations.add(stop)
    agents.set(agent, stop)
  }

  const sync = (agent: CreatorAgent): void => {
    if (registry.isCreatorSource(agent.session.header.cwd?.trim() ?? '')) attach(agent)
    else detach(agent)
  }

  const stopCreated = ctx.on('agent/created', ({ agent }) => { sync(agent) })
  const stopPresetSelected = ctx.on('agent-preset/selected', (sessionId) => {
    const agent = ctx.agents.get(sessionId)
    if (agent !== undefined) sync(agent)
  })
  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => { detach(agent) })
  const stopSessionEvent = ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      const agent = ctx.agents.get(session.id)
      if (agent !== undefined) sync(agent)
      return
    }
    if (event.type !== 'turn/end') return
    const state = sessions.get(session)
    if (state === undefined || !state.pendingRestart || state.restartDispatchStarted) return
    state.restartDispatchStarted = true
    void Promise.resolve().then(async () => {
      if (!await ctx.sessions.flush(session)) {
        throw new Error('Creator session could not be durably flushed; refusing to restart.')
      }
      await registry.restartCreator(state.cwd)
    }).catch((error: unknown) => {
      ctx.logger.warn(`deepdeck App restart after turn flush failed: ${errorMessage(error)}`)
    })
  })
  const dispose = () => {
    stopSessionEvent()
    stopDisposed()
    stopPresetSelected()
    stopCreated()
    for (const stop of [...registrations]) stop()
  }
  return Object.assign(dispose, {
    assertReady: async (
      sessionId: string,
      appId: string,
      signal?: AbortSignal,
    ): Promise<AppCreatorReadyResult> => {
      const agent = ctx.agents.get(sessionId)
      if (agent === undefined) throw new Error('Creator Agent is not active.')
      sync(agent)
      const state = states.get(agent)
      if (state === undefined) throw new Error('Creator Apply guard is not attached to this App source.')
      if (ctx.agentPresets.composedPreset(agent.ctx) !== 'cordis') {
        throw new Error('Creator Agent did not enter the cordis preset.')
      }
      const context = await ensureBound(state, signal)
      if (context.appId !== appId) throw new Error('Creator Agent is bound to a different App.')
      return Object.freeze({
        protocolVersion: APP_CREATOR_PROTOCOL_VERSION,
        sessionId,
        appId: context.appId,
        agentPreset: 'cordis',
        sourcePackageRoot: context.sourcePackageRoot,
        tools: [
          'deepdeck_app_context',
          'deepdeck_app_apply',
          'deepdeck_app_rebuild',
          'deepdeck_app_restart',
        ] as const,
        skills: [DEEPDECK_VIBE_APP_SKILL_NAME] as const,
      })
    },
  })
}
