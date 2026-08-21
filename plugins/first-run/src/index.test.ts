import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKSPACE_DIRECTORY,
  DEFAULT_WORKSPACE_TITLE,
  ensureDefaultWorkspace,
  keepDefaultWorkspace,
  type FirstRunHostContext,
  type DefaultWorkspaceRegistry,
  type WorkspaceDomainChange,
} from './index.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('ensureDefaultWorkspace', () => {
  it('creates and registers a visible default project for an empty profile', async () => {
    const home = await mkdtemp(join(tmpdir(), 'deepdeck-first-run-'))
    temporaryDirectories.push(home)
    const create = vi.fn(async () => ({}))
    const registry: DefaultWorkspaceRegistry = { list: () => [], create }

    await ensureDefaultWorkspace(registry, home)

    const path = join(home, DEFAULT_WORKSPACE_DIRECTORY)
    await expect(access(path)).resolves.toBeUndefined()
    expect(create).toHaveBeenCalledWith(path, DEFAULT_WORKSPACE_TITLE)
  })

  it('leaves an existing workspace registry untouched', async () => {
    const create = vi.fn(async () => ({}))
    await ensureDefaultWorkspace({ list: () => [{}], create }, '/unused')
    expect(create).not.toHaveBeenCalled()
  })

  it('does not add a default when another workspace appears while creating its directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'deepdeck-first-run-race-'))
    temporaryDirectories.push(home)
    let listCalls = 0
    const create = vi.fn(async () => ({}))
    const registry: DefaultWorkspaceRegistry = {
      list: vi.fn(() => ++listCalls === 1 ? [] : [{}]),
      create,
    }

    await ensureDefaultWorkspace(registry, home)

    expect(create).not.toHaveBeenCalled()
  })
})

describe('keepDefaultWorkspace', () => {
  it('restores the fallback after the last workspace registration is deleted', async () => {
    const home = await mkdtemp(join(tmpdir(), 'deepdeck-workspace-guard-'))
    temporaryDirectories.push(home)
    const items: unknown[] = []
    const create = vi.fn(async () => { items.push({}) })
    let listener: ((change: WorkspaceDomainChange) => void) | undefined
    const ctx: FirstRunHostContext = {
      workspaceRegistry: { list: () => items, create },
      logger: { warn: vi.fn() },
      on: vi.fn((_name, next) => {
        listener = next
        return () => {}
      }),
    }
    keepDefaultWorkspace(ctx, home)

    listener?.({ domain: 'workspace', table: 'workspaces', operation: 'deleted' })
    listener?.({ domain: 'workspace', table: 'workspaces', operation: 'deleted' })

    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        join(home, DEFAULT_WORKSPACE_DIRECTORY),
        DEFAULT_WORKSPACE_TITLE,
      )
      expect(create).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores unrelated domain changes and deletions while a workspace remains', async () => {
    const create = vi.fn(async () => ({}))
    const items: unknown[] = [{}]
    let listener: ((change: WorkspaceDomainChange) => void) | undefined
    const ctx: FirstRunHostContext = {
      workspaceRegistry: { list: () => items, create },
      logger: { warn: vi.fn() },
      on: (_name, next) => {
        listener = next
        return () => {}
      },
    }
    keepDefaultWorkspace(ctx, '/unused')

    listener?.({ domain: 'other', table: 'workspaces', operation: 'deleted' })
    listener?.({ domain: 'workspace', table: 'other', operation: 'deleted' })
    listener?.({ domain: 'workspace', table: 'workspaces', operation: 'put' })
    listener?.({ domain: 'workspace', table: 'workspaces', operation: 'deleted' })
    await Promise.resolve()

    expect(create).not.toHaveBeenCalled()
  })

  it('contains and reports a runtime repair failure', async () => {
    const home = await mkdtemp(join(tmpdir(), 'deepdeck-workspace-guard-failure-'))
    temporaryDirectories.push(home)
    const failure = new Error('disk full')
    const warn = vi.fn()
    const create = vi.fn(async () => { throw failure })
    let listener: ((change: WorkspaceDomainChange) => void) | undefined
    const ctx: FirstRunHostContext = {
      workspaceRegistry: { list: () => [], create },
      logger: { warn },
      on: (_name, next) => {
        listener = next
        return () => {}
      },
    }
    keepDefaultWorkspace(ctx, home)

    listener?.({ domain: 'workspace', table: 'workspaces', operation: 'deleted' })

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'unable to restore the default Workspace: Error: disk full',
      )
    })
  })
})
