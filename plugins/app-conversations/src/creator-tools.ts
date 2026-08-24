import type {
  AppConversationHostRegistry,
  AppCreatorContext,
  AppRebuildResult,
  AppRestartResult,
} from './contracts.js'

interface CreatorToolExecution {
  readonly agent?: {
    readonly session: {
      readonly header: {
        readonly cwd?: string
      }
    }
  }
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
  readonly agentPresets: {
    composedPreset(agentContext: CreatorModeScopedContext): string | undefined
  }
  on(
    event: 'agent/created' | 'agent/disposed',
    listener: (payload: { readonly agent: { readonly ctx: CreatorModeScopedContext } }) => void,
  ): () => void
}

interface CreatorModeScopedContext {
  readonly tools: {
    register(definition: CreatorToolDefinition): () => void
  }
  readonly systemPrompt: {
    section(definition: {
      readonly name: string
      readonly order: number
      readonly text: string
    }): () => void
  }
}

const EMPTY_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const

const STRING_OUTPUT = {
  schema: { type: 'string' } as const,
  render(_args: unknown, value: string) {
    return [{ type: 'text' as const, text: value }]
  },
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
  }, null, 2)
}

function renderRebuild(result: AppRebuildResult): string {
  return JSON.stringify({
    appId: result.appId,
    packageName: result.packageName,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    hostReloaded: result.hostReloaded,
    buildLog: result.buildLog,
  }, null, 2)
}

function renderRestart(result: AppRestartResult): string {
  return JSON.stringify({
    appId: result.appId,
    packageName: result.packageName,
    restartScheduled: result.restartScheduled,
    message: 'DeepDeck is restarting the Harness runtime. The desktop window will reconnect automatically.',
  }, null, 2)
}

/** Creator-only tools. Registration scope, not runtime argument checks, controls visibility. */
export function appCreatorToolDefinitions(
  registry: AppConversationHostRegistry,
): readonly CreatorToolDefinition[] {
  return [
    {
      name: 'deepdeck_app_context',
      description: 'Inspect the DeepDeck App bound to this Creator session, including its trusted source package and Bun rebuild availability.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderContext(await registry.creatorContext(creatorWorkspace(exec), exec.signal))
      },
    },
    {
      name: 'deepdeck_app_rebuild',
      description: 'Run the bound App\'s reviewed Bun build and hot-reload its active Cordis Host and Client outputs. Call after source edits that should take effect.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderRebuild(await registry.rebuildCreator(creatorWorkspace(exec), exec.signal))
      },
    },
    {
      name: 'deepdeck_app_restart',
      description: 'Restart the DeepDeck Harness runtime so the bound App can load dependency, Cordis patch, entry-point, or runtime-assembly changes that cannot be applied safely by hot reload. Call only as the final action after validation and build complete; the desktop window reconnects automatically.',
      parameters: EMPTY_PARAMETERS,
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return renderRestart(await registry.restartCreator(creatorWorkspace(exec), exec.signal))
      },
    },
  ]
}

/** Install App tools into each live agent that selected the shipped `cordis` Creator preset. */
export function installAppCreatorMode(
  ctx: CreatorModeHostContext,
  registry: AppConversationHostRegistry,
): () => void {
  const registrations = new Set<() => void>()
  const agents = new WeakMap<object, () => void>()
  const stopCreated = ctx.on('agent/created', ({ agent }) => {
    if (ctx.agentPresets.composedPreset(agent.ctx) !== 'cordis') return
    const scoped = agent.ctx as unknown as CreatorModeScopedContext
    const disposers = appCreatorToolDefinitions(registry).map(
      definition => scoped.tools.register(definition),
    )
    disposers.push(scoped.systemPrompt.section({
      name: 'deepdeck:app-creator',
      order: 95,
      text: [
        'When this Creator session was launched from Settings > Apps, its Workspace is the registered App source package.',
        'Call deepdeck_app_context before App-specific work to verify that binding.',
        'After source edits that should take effect, call deepdeck_app_rebuild. It runs the reviewed Bun build and Cordis hot reload; do not substitute an arbitrary source path.',
        'If dependencies, cordis.patch.yml, package exports or entry points, or runtime assembly changed, or safe hot reload is unavailable, call deepdeck_app_restart as the final action after checks and build complete. Do not ask the user to restart manually when this tool is available.',
        'A Creator session opened elsewhere may not be bound to an App; in that case these App tools will refuse the operation.',
      ].join(' '),
    }))
    let active = true
    const stop = () => {
      if (!active) return
      active = false
      registrations.delete(stop)
      for (const dispose of disposers.reverse()) dispose()
    }
    registrations.add(stop)
    agents.set(agent, stop)
  })
  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => {
    const stop = agents.get(agent)
    if (stop === undefined) return
    registrations.delete(stop)
    agents.delete(agent)
  })
  return () => {
    stopDisposed()
    stopCreated()
    for (const stop of [...registrations]) stop()
  }
}
