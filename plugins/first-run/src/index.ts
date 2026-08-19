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

export interface FirstRunHostContext {
  workspaceRegistry: DefaultWorkspaceRegistry
}

/** Ensure a profile with no registered projects gets one ordinary directory. */
export async function ensureDefaultWorkspace(
  registry: DefaultWorkspaceRegistry,
  home: string,
): Promise<void> {
  if (registry.list().length > 0) return
  const path = join(home, DEFAULT_WORKSPACE_DIRECTORY)
  await mkdir(path, { recursive: true })
  await registry.create(path, DEFAULT_WORKSPACE_TITLE)
}

/**
 * Give a fresh profile one real, durable Workspace before the browser loads.
 * Existing registries are never modified, and the directory is ordinary user
 * content under the home directory rather than hidden Harness state.
 */
export async function apply(ctx: FirstRunHostContext): Promise<void> {
  await ensureDefaultWorkspace(ctx.workspaceRegistry, homedir())
}
