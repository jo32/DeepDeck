import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { SettingsNamespace, SettingsScope } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import {
  COMPUTER_USE_MCP_ENTRY_ID,
  COMPUTER_USE_SETTINGS_NAMESPACE,
  type ComputerUseRuntime,
  type ComputerUseSettings,
} from './contracts.ts'

export {
  COMPUTER_USE_MCP_ENTRY_ID,
  COMPUTER_USE_SETTINGS_NAMESPACE,
  type ComputerUseRuntime,
  type ComputerUseSettings,
} from './contracts.ts'

export const name = 'deepdeck-computer-use'
export const inject = ['loader', 'settings', 'tools']

const COMPUTER_USE_TOOL_PREFIX = 'mcp__open-computer-use__'
export const COMPUTER_USE_DISABLE_APP_AGENT_PROXY_ENV = 'OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY'
export const COMPUTER_USE_AGENT_TEMP_DIRECTORY_NAME = 'deepdeck-open-computer-use'

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
      if (Boolean(entry.options.disabled) === disabled) return
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
 * Ask the bundled macOS app to check its own TCC permissions. Upstream's
 * `doctor` command exits without UI when everything is granted and presents
 * its native onboarding window only when Accessibility or Screen Recording is
 * missing. One check is made per enabled period so concurrent tool calls cannot
 * produce duplicate windows.
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
    let child: ChildProcess
    try {
      child = this.spawnProcess(
        process.execPath,
        [runtime.launcher, 'doctor'],
        {
          cwd: runtime.root,
          env: {
            ...process.env,
            TMPDIR: runtime.agentTempDirectory,
            [COMPUTER_USE_DISABLE_APP_AGENT_PROXY_ENV]: '1',
          },
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

/** Resolve the launcher from this plugin's copied production dependency. */
export function resolveComputerUseRuntime(
  enabled = true,
  metaUrl = import.meta.url,
  temporaryDirectory = tmpdir(),
): ComputerUseRuntime {
  const root = fileURLToPath(new URL('../', metaUrl))
  const launcher = join(root, 'node_modules', 'open-computer-use', 'bin', 'open-computer-use')
  if (!existsSync(launcher)) {
    throw new Error(`bundled open-computer-use launcher is missing: ${launcher}`)
  }
  const agentTempDirectory = join(temporaryDirectory, COMPUTER_USE_AGENT_TEMP_DIRECTORY_NAME)
  mkdirSync(agentTempDirectory, { recursive: true, mode: 0o700 })
  return { enabled, root, launcher, agentTempDirectory }
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
    COMPUTER_USE_MCP_ENTRY_ID,
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

  // The sibling MCP row is deliberately mounted disabled. Cordis builds patch
  // rows in stages, so observe its construction and only then apply the
  // persisted preference. An opted-out profile never starts the process.
  ctx.provide('deepdeckComputerUse', runtime)

  const applyInitialPreference = (entry: Entry): void => {
    queueMicrotask(() => {
      if (entry.options.id !== COMPUTER_USE_MCP_ENTRY_ID) return
      void syncPreference(scope.get().enabled).catch((error: unknown) => {
        ctx.root.logger?.('computer-use').error(error)
      })
    })
  }
  ctx.effect(
    () => ctx.on('loader/entry-init', applyInitialPreference, { global: true }),
    'computer-use: activate the mounted MCP entry from settings',
  )

  // HMR can apply this plugin after the MCP row already exists.
  try {
    applyInitialPreference(ctx.loader.resolve(mcpEntryId))
  } catch {
    // Normal first boot: the listener above observes the later patch row.
  }

  ctx.effect(
    () => scope.watch((next) => {
      return syncPreference(next.enabled)
    }),
    'computer-use: gate MCP loader entry from settings',
  )
  ctx.effect(
    () => ctx.on('tools/pre-execute', async (exec, next) => {
      if (runtime.enabled && isComputerUseToolName(exec.name)) {
        // Run the permission UI as a standalone process and wait for it before
        // dispatching the first native call. The MCP agent stays alive on its
        // isolated socket, so onboarding cannot terminate the tool connection.
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
