import { mkdtemp, mkdir, rm, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { listDraftFiles, listWorkspaceFiles, readDraftFile } from './publication-files.js'

let workspace: string
let root: string
const draft = 'webmcp-publish-test'
beforeEach(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'publication-files-')))
  root = join(workspace, draft)
})
afterEach(async () => { await rm(workspace, { recursive: true, force: true }) })
it('lists an empty workspace and existing site files before and after exporting a draft', async () => {
  expect(await listWorkspaceFiles(workspace)).toMatchObject({ home: workspace, parent: null, entries: [] })
  await writeFile(join(workspace, 'research.md'), '# Existing report')
  await mkdir(join(workspace, '.agents', 'skills'), { recursive: true })
  expect((await listWorkspaceFiles(workspace)).entries.map(entry => entry.name)).toEqual(['.agents', 'research.md'])
  expect(await listDraftFiles(workspace)).toBeNull()
  await mkdir(root)
  await writeFile(join(root, 'webmcp.json'), '{}')
  const listing = await listWorkspaceFiles(workspace)
  expect(listing.home).toBe(workspace)
  expect(listing.entries.map(entry => entry.name)).toEqual(['.agents', draft, 'research.md'])
})
it('restores the saved draft, shows hidden skills and confines breadcrumbs to the draft', async () => {
  expect(await listDraftFiles(workspace)).toBeNull()
  await mkdir(join(root, '.agents', 'skills', 'read-articles'), { recursive: true })
  await writeFile(join(root, '.agents', 'skills', 'read-articles', 'SKILL.md'), '# Read articles')
  await writeFile(join(root, 'webmcp.json'), '{}')
  const listing = (await listDraftFiles(workspace))!
  expect(listing.parent).toBeNull()
  expect(listing.crumbs.map(row => row.name)).toEqual([draft])
  expect(listing.entries.map(row => row.name)).toEqual(['.agents', 'webmcp.json'])
  const nested = (await listDraftFiles(workspace, draft, join(listing.home, '.agents', 'skills', 'read-articles')))!
  expect(await readDraftFile(workspace, draft, nested.entries[0]!.path)).toMatchObject({ kind: 'text', text: '# Read articles' })
})
it('rejects traversal, other-site files and symlinks', async () => {
  await mkdir(root)
  const outside = join(workspace, 'private.txt')
  await writeFile(outside, 'private')
  await symlink(outside, join(root, 'link.txt'))
  await symlink(workspace, join(root, 'escape'))
  await expect(listDraftFiles(workspace, '../private')).rejects.toThrow('Invalid publication draft')
  await expect(readDraftFile(workspace, draft, outside)).rejects.toThrow('outside')
  await expect(readDraftFile(workspace, draft, join(root, 'link.txt'))).rejects.toThrow('Symbolic')
  await expect(readDraftFile(workspace, draft, join(root, 'escape', 'private.txt'))).rejects.toThrow('Symbolic')
  expect((await listDraftFiles(workspace))!.entries).toEqual([])
})
it('bounds previews and handles binary and empty files', async () => {
  await mkdir(root)
  await writeFile(join(root, 'large.ts'), 'a'.repeat(400_000))
  await writeFile(join(root, 'binary'), Buffer.from([0, 1, 2]))
  await writeFile(join(root, 'empty'), '')
  const large = await readDraftFile(workspace, draft, join(root, 'large.ts'))
  expect(large.truncated).toBe(true)
  expect(large.text).toHaveLength(300_000)
  expect((await readDraftFile(workspace, draft, join(root, 'binary'))).kind).toBe('binary')
  expect((await readDraftFile(workspace, draft, join(root, 'empty'))).kind).toBe('empty')
})
