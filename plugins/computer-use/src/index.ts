import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { SettingsNamespace, SettingsScope } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import {
  COMPUTER_USE_MCP_ENTRY_ID,
  COMPUTER_USE_RUNTIME_GROUP_ID,
  COMPUTER_USE_SETTINGS_NAMESPACE,
  type ComputerUseRuntime,
  type ComputerUseSettings,
} from './contracts.ts'

export {
  COMPUTER_USE_MCP_ENTRY_ID,
  COMPUTER_USE_RUNTIME_GROUP_ID,
  COMPUTER_USE_SETTINGS_NAMESPACE,
  type ComputerUseRuntime,
  type ComputerUseSettings,
} from './contracts.ts'

export const name = 'deepdeck-computer-use'
export const inject = ['loader', 'settings', 'tools']

const COMPUTER_USE_TOOL_PREFIX = 'mcp__open-computer-use__'

export interface ComputerUseHostContext extends Context {
  readonly loader: Loader
}

export const ComputerUseSettingsSchema: z<ComputerUseSettings> = z.object({
  enabled: z.boolean().default(true),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    deepdeckComputerUse: ComputerUseRuntime
  }
}

/**
 * Serialize toggles onto the Cordis Loader. Disabling the MCP entry disposes
 * its fiber, which in turn closes the stdio server and unregisters its tools.
 */
export class ComputerUseLoaderGate {
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly loader: Pick<Loader, 'resolve' | 'update'>,
    private readonly entryId = COMPUTER_USE_MCP_ENTRY_ID,
  ) {}

  setEnabled(enabled: boolean): Promise<void> {
    const disabled = !enabled
    const task = this.tail.then(async () => {
      const entry = this.loader.resolve(this.entryId)
      // The initial composition uses a `!!js` expression so the nested row can
      // join the Host startup barrier without spawning for opted-out profiles.
      // A live preference change must replace that expression with a concrete
      // boolean; merely changing the service property does not remount a row.
      const configured = entry.options.disabled
      if ((configured == null && !disabled) || configured === disabled) return
      await this.loader.update(this.entryId, { disabled })
    })
    this.tail = task.catch(() => {})
    return task
  }
}

export type SpawnComputerUseProcess = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess

/**
 * Open the signed helper through LaunchServices and wait for its native
 * onboarding instance. This makes the process asking for Accessibility and
 * Screen Recording identical to the process that serves MCP requests.
 */
export class ComputerUsePermissionOnboarding {
  private checkedForCurrentEnable = false
  private activeCheck: {
    readonly child: ChildProcess
    readonly completion: Promise<void>
    readonly finish: () => void
  } | undefined

  constructor(
    private readonly spawnProcess: SpawnComputerUseProcess = spawn,
    private readonly platform = process.platform,
    private readonly reportError: (error: Error) => void = () => {},
  ) {}

  sync(enabled: boolean, runtime: ComputerUseRuntime): Promise<void> {
    if (!enabled) {
      this.checkedForCurrentEnable = false
      this.stopActiveChild()
      return Promise.resolve()
    }
    if (this.platform !== 'darwin') return Promise.resolve()
    if (this.checkedForCurrentEnable) {
      return this.activeCheck?.completion ?? Promise.resolve()
    }

    this.checkedForCurrentEnable = true
    if (!runtime.appBundle) return Promise.resolve()
    let child: ChildProcess
    try {
      child = this.spawnProcess(
        '/usr/bin/open',
        ['-W', '-n', runtime.appBundle],
        {
          cwd: runtime.root,
          env: process.env,
          stdio: 'ignore',
          windowsHide: true,
        },
      )
    } catch (error) {
      this.reportError(error instanceof Error ? error : new Error(String(error)))
      return Promise.resolve()
    }

    let resolveCompletion: () => void = () => {}
    let settled = false
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (this.activeCheck?.child === child) this.activeCheck = undefined
      if (error) this.reportError(error)
      resolveCompletion()
    }
    this.activeCheck = { child, completion, finish: () => { finish() } }
    child.once('error', (error) => { finish(error) })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        finish()
        return
      }
      const outcome = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
      finish(new Error(`open-computer-use doctor exited with ${outcome}`))
    })
    return completion
  }

  dispose(): void {
    this.stopActiveChild()
  }

  private stopActiveChild(): void {
    const activeCheck = this.activeCheck
    this.activeCheck = undefined
    if (!activeCheck) return
    activeCheck.finish()
    const child = activeCheck.child
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill()
    }
  }
}

/** Match only tools registered by this plugin's MCP server namespace. */
export function isComputerUseToolName(name: string): boolean {
  return name.startsWith(COMPUTER_USE_TOOL_PREFIX)
}

/** Resolve a sibling row inside the same nested Cordis loader tree. */
export function resolveSiblingLoaderEntryId(
  currentEntryId: string | undefined,
  siblingEntryId: string,
): string {
  if (!currentEntryId) return siblingEntryId
  const separator = currentEntryId.lastIndexOf(':')
  return separator < 0
    ? siblingEntryId
    : `${currentEntryId.slice(0, separator + 1)}${siblingEntryId}`
}

/** Resolve the platform transport from this plugin's copied dependency. */
export function resolveComputerUseRuntime(
  enabled = true,
  metaUrl = import.meta.url,
  platform = process.platform,
): ComputerUseRuntime {
  const root = fileURLToPath(new URL('../', metaUrl))
  const launcher = join(root, 'node_modules', 'open-computer-use', 'bin', 'open-computer-use')
  if (!existsSync(launcher)) {
    throw new Error(`bundled open-computer-use launcher is missing: ${launcher}`)
  }
  if (platform !== 'darwin') {
    return {
      enabled,
      root,
      mcpCommand: process.execPath,
      mcpArgs: [launcher, 'mcp'],
    }
  }

  const appBundle = join(
    root,
    'node_modules',
    'open-computer-use',
    'dist',
    'Open Computer Use.app',
  )
  const compiledProxy = fileURLToPath(new URL('./app-agent-proxy.js', metaUrl))
  const sourceProxy = fileURLToPath(new URL('./app-agent-proxy.ts', metaUrl))
  const appAgentProxy = existsSync(compiledProxy) ? compiledProxy : sourceProxy
  if (!existsSync(appBundle)) {
    throw new Error(`bundled Open Computer Use.app is missing: ${appBundle}`)
  }
  if (!existsSync(appAgentProxy)) {
    throw new Error(`DeepDeck Computer Use app-agent proxy is missing: ${appAgentProxy}`)
  }
  return {
    enabled,
    root,
    mcpCommand: process.execPath,
    mcpArgs: [appAgentProxy, appBundle, 'mcp'],
    appBundle,
  }
}

/** Register the default-on preference and gate the native MCP loader entry. */
export async function apply(
  ctx: ComputerUseHostContext,
  permissionOnboarding?: Pick<ComputerUsePermissionOnboarding, 'sync' | 'dispose'>,
): Promise<void> {
  const scope: SettingsScope<ComputerUseSettings> = ctx.settings.register(
    COMPUTER_USE_SETTINGS_NAMESPACE as SettingsNamespace,
    ComputerUseSettingsSchema,
    { base: { enabled: true }, applies: 'live' },
  )
  const mcpEntryId = resolveSiblingLoaderEntryId(
    ctx.loader.locate(),
    `${COMPUTER_USE_RUNTIME_GROUP_ID}:${COMPUTER_USE_MCP_ENTRY_ID}`,
  )
  const gate = new ComputerUseLoaderGate(ctx.loader, mcpEntryId)
  const runtime = resolveComputerUseRuntime(scope.get().enabled)
  const onboarding = permissionOnboarding ?? new ComputerUsePermissionOnboarding(
    spawn,
    process.platform,
    error => ctx.root.logger?.('computer-use').error(error),
  )
  let preferenceRevision = 0
  const syncPreference = async (enabled: boolean): Promise<void> => {
    const revision = ++preferenceRevision
    runtime.enabled = enabled
    // Disabling cancels and rearms onboarding. Enabling must remain silent:
    // permissions are requested only when an agent actually invokes a
    // Computer Use tool.
    if (!enabled) await onboarding.sync(false, runtime)
    if (revision !== preferenceRevision || runtime.enabled !== enabled) return
    await gate.setEnabled(enabled)
  }

  // The MCP row lives in a nested group that depends on this service. The
  // group therefore sees the persisted preference before it evaluates the
  // child's `disabled` expression, while its async MCP discovery remains part
  // of the Host startup barrier for default-enabled profiles.
  ctx.provide('deepdeckComputerUse', runtime)

  ctx.effect(
    () => scope.watch((next) => {
      return syncPreference(next.enabled)
    }),
    'computer-use: gate MCP loader entry from settings',
  )
  ctx.effect(
    () => ctx.on('tools/pre-execute', async (exec, next) => {
      if (runtime.enabled && isComputerUseToolName(exec.name)) {
        // LaunchServices gives onboarding and MCP the same stable signed app
        // identity. The app-agent proxy uses a DeepDeck-specific socket.
        await onboarding.sync(true, runtime)
      }
      return next()
    }),
    'computer-use: request permissions on first tool call',
  )
  ctx.effect(
    () => () => {
      preferenceRevision += 1
      runtime.enabled = false
      onboarding.dispose()
    },
    'computer-use: stop permission onboarding on plugin disposal',
  )
}
