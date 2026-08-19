import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKSPACE_DIRECTORY,
  DEFAULT_WORKSPACE_TITLE,
  ensureDefaultWorkspace,
  type DefaultWorkspaceRegistry,
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
})
