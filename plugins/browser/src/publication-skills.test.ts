import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { exportSiteSkills } from './publication-skills.js'
const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function workspace() { const root = await mkdtemp(join(tmpdir(), 'webmcp-skills-')); folders.push(root); return root }
it('exports only site skills and their resources, preserving script execution and file inventory', async () => {
  const root = await workspace(); const output = await workspace()
  await mkdir(join(root, '.agents/skills/articles/scripts'), { recursive: true })
  await writeFile(join(root, '.agents/skills/articles/SKILL.md'), '---\nname: articles\ndescription: Read articles\n---\nUse the read tool.')
  await writeFile(join(root, '.agents/skills/articles/scripts/read.sh'), 'echo articles', { mode: 0o700 })
  await writeFile(join(root, 'private.txt'), 'not for publication')
  const result = await exportSiteSkills(root, output)
  expect(result.snapshot).toBe('current-site-workspace')
  expect(result.files.map(row => row.path)).toEqual(['.agents/skills/articles/SKILL.md', '.agents/skills/articles/scripts/read.sh'])
  expect(await readFile(join(output, result.files[1]!.path), 'utf8')).toBe('echo articles')
  await expect(readFile(join(output, 'private.txt'))).rejects.toThrow()
})
it('refuses linked skill roots and linked resources instead of copying external files', async () => {
  const root = await workspace(); const output = await workspace(); const external = await workspace()
  await symlink(external, join(root, '.agents'))
  await expect(exportSiteSkills(root, output)).rejects.toThrow('local project skill')
  await rm(join(root, '.agents')); await mkdir(join(root, '.agents/skills/read'), { recursive: true })
  await writeFile(join(root, '.agents/skills/read/SKILL.md'), 'Read')
  await writeFile(join(external, 'secret'), 'secret')
  await symlink(join(external, 'secret'), join(root, '.agents/skills/read/token'))
  await expect(exportSiteSkills(root, output)).rejects.toThrow('linked skill')
})
