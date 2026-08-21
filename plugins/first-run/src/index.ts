import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'deepdeck-first-run'
export const inject = ['workspaceRegistry']

export const DEFAULT_WORKSPACE_DIRECTORY = 'DeepDeck'
export const DEFAULT_WORKSPACE_TITLE = 'Default Workspace'

export interface DefaultWorkspaceRegistry {
  list(): readonly unknown[]
  create(path: string, title?: string): Promise<unknown>
}

export interface WorkspaceDomainChange {
  readonly domain: string
  readonly table: string
  readonly operation: 'put' | 'deleted'
}

export interface FirstRunHostContext {
  workspaceRegistry: DefaultWorkspaceRegistry
  logger: { warn(message: string): void }
  on(
    name: 'domain/changed',
    listener: (change: WorkspaceDomainChange) => void,
  ): () => void
}

/** Ensure a profile with no registered projects gets one ordinary directory. */
export async function ensureDefaultWorkspace(
  registry: DefaultWorkspaceRegistry,
  home: string,
): Promise<void> {
  if (registry.list().length > 0) return
  const path = join(home, DEFAULT_WORKSPACE_DIRECTORY)
  await mkdir(path, { recursive: true })
  // Creating the directory yields to the event loop. Re-check so a Workspace
  // adopted concurrently is not followed by an unnecessary default one.
  if (registry.list().length > 0) return
  await registry.create(path, DEFAULT_WORKSPACE_TITLE)
}

/**
 * Restore the default after the last durable Workspace registration is
 * deleted. The registry serializes create/delete operations; coalescing here
 * keeps a burst of domain notifications from scheduling duplicate repairs.
 */
export function keepDefaultWorkspace(
  ctx: FirstRunHostContext,
  home: string,
): () => void {
  let repair: Promise<void> | undefined
  return ctx.on('domain/changed', (change) => {
    if (
      change.domain !== 'workspace'
      || change.table !== 'workspaces'
      || change.operation !== 'deleted'
      || ctx.workspaceRegistry.list().length > 0
    ) return

    repair ??= ensureDefaultWorkspace(ctx.workspaceRegistry, home)
      .catch((error: unknown) => {
        ctx.logger.warn(`unable to restore the default Workspace: ${String(error)}`)
      })
      .finally(() => {
        repair = undefined
      })
  })
}

/**
 * Keep one real, durable Workspace available for every profile. Existing
 * registries are never modified, and the fallback directory is ordinary user
 * content under the home directory rather than hidden Harness state.
 */
export async function apply(ctx: FirstRunHostContext): Promise<void> {
  const home = homedir()
  keepDefaultWorkspace(ctx, home)
  await ensureDefaultWorkspace(ctx.workspaceRegistry, home)
}
