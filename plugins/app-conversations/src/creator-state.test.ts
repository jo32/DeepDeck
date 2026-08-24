import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  changedWorkspaceFiles,
  requiresRuntimeRestart,
  snapshotAppWorkspace,
} from './creator-state.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deepdeck-creator-state-'))
  roots.push(root)
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'index.js'), 'export const value = 1\n')
  return root
}

describe('Creator App Workspace state', () => {
  it('detects all Workspace output changes while ignoring VCS and dependencies', async () => {
    const root = await fixture()
    const before = await snapshotAppWorkspace(root)
    await mkdir(join(root, 'lib'))
    await writeFile(join(root, 'lib', 'index.js'), 'export const value = 2\n')
    await mkdir(join(root, '.git'))
    await writeFile(join(root, '.git', 'HEAD'), 'ignored\n')
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'node_modules', 'ignored.js'), 'ignored\n')
    const after = await snapshotAppWorkspace(root)

    expect(changedWorkspaceFiles(before, after)).toEqual(['lib/index.js'])
  })

  it('classifies loader and profile inputs conservatively', () => {
    expect(requiresRuntimeRestart(['src/index.js'])).toBe(false)
    expect(requiresRuntimeRestart(['package.json'])).toBe(true)
    expect(requiresRuntimeRestart(['cordis.patch.yml'])).toBe(true)
    expect(requiresRuntimeRestart(['src/invariant.ts'])).toBe(true)
  })
})
