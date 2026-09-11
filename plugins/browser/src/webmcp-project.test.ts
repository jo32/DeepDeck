import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { WebMCPProject, sourceDigest } from './webmcp-project.js'
import type { GitHubSource, WebMCPPackage } from './webmcp-package.js'

let root: string, remote: string, workspace: string, project: WebMCPProject
let previousConfig: string | undefined
const original = 'const first = 1;\n' + '\n'.repeat(12) + 'const second = 1;\n'
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const manifest = (source: string): WebMCPPackage => ({ formatVersion: 1, name: 'Community project', description: 'Example project', version: '1.0.0', origin: 'https://example.com', entry: 'src/webmcp.ts', sourceSha256: sourceDigest(source), runtime: { id: 'deepdeck-webmcp', sdkVersion: 1 }, license: 'MIT', tools: [], tags: [] })
async function candidate(source: string) {
  await writeFile(join(remote, 'src/webmcp.ts'), source)
  await writeFile(join(remote, 'webmcp.json'), JSON.stringify(manifest(source), null, 2))
  git(remote, 'add', '-A'); git(remote, 'commit', '--allow-empty', '-m', 'Upstream version')
  const provenance: GitHubSource = { repositoryId: 1, repository: 'https://github.com/test/project', manifestPath: 'webmcp.json', commit: git(remote, 'rev-parse', 'HEAD'), version: '1.0.0', sourceSha256: sourceDigest(source) }
  return { source, manifest: manifest(source), provenance }
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'webmcp-project-'))
  remote = join(root, 'upstream'); workspace = join(root, 'workspace')
  await mkdir(join(remote, 'src'), { recursive: true }); await mkdir(workspace)
  git(remote, 'init')
  previousConfig = process.env.GIT_CONFIG_GLOBAL
  const config = join(root, 'gitconfig')
  await writeFile(config, `[url "file://${remote}"]\n\tinsteadOf = https://github.com/test/project\n`)
  process.env.GIT_CONFIG_GLOBAL = config
  await writeFile(join(remote, 'LICENSE'), 'MIT fixture license')
  await mkdir(join(remote, '.agents/skills/example'), { recursive: true })
  await writeFile(join(remote, '.agents/skills/example/SKILL.md'), '# Upstream skill')
  project = new WebMCPProject(workspace)
})
afterEach(async () => {
  if (previousConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL
  else process.env.GIT_CONFIG_GLOBAL = previousConfig
  await rm(root, { recursive: true, force: true })
})
it('starts from exact upstream history, preserves license and skills, and detects stale source writes', async () => {
  const base = await candidate(original)
  await project.start(base)
  expect(git(project.directory, 'rev-parse', 'HEAD')).toBe(base.provenance.commit)
  expect(await readFile(join(project.directory, 'LICENSE'), 'utf8')).toBe('MIT fixture license')
  expect(await readFile(join(project.directory, '.agents/skills/example/SKILL.md'), 'utf8')).toBe('# Upstream skill')
  await project.write(original + '// local\n', sourceDigest(original))
  await expect(project.write('stale overwrite', sourceDigest(original))).rejects.toThrow('Source changed')
  expect((await project.state())?.changed).toBe(true)
  expect((await new WebMCPProject(workspace).state())?.upstream.commit).toBe(base.provenance.commit)
})
it('previews a three-way merge without touching local files, then keeps both changes', async () => {
  await project.start(await candidate(original))
  const local = original.replace('first = 1', 'first = 2')
  await project.write(local, sourceDigest(original))
  await project.updateManifest(sourceDigest(local))
  const upstream = await candidate(original.replace('second = 1', 'second = 2'))
  const preview = await project.preview(upstream)
  expect(preview.conflicts).toEqual([])
  expect(preview.diff).toContain('second = 2')
  expect((await project.read())?.source).toBe(local)
  await project.merge(preview.token)
  expect((await project.read())?.source).toContain('first = 2')
  expect((await project.read())?.source).toContain('second = 2')
  expect((await project.state())?.upstream.commit).toBe(upstream.provenance.commit)
  expect((await project.state())?.merging).toBe(false)
})
it('rejects stale merge previews when any working file changes', async () => {
  await project.start(await candidate(original))
  const preview = await project.preview(await candidate(original + '// upstream\n'))
  await writeFile(join(project.directory, 'README.md'), 'New local notes')
  await expect(project.merge(preview.token)).rejects.toThrow('Local project changed')
  await project.cancel(preview.token)
  expect((await project.read())?.source).toBe(original)
  expect(await readFile(join(project.directory, 'README.md'), 'utf8')).toBe('New local notes')
})
it('persists conflicts across restart, blocks unresolved finish, and abort restores local changes', async () => {
  const base = await candidate(original)
  await project.start(base)
  const local = original.replace('first = 1', 'first = 2')
  await project.write(local, sourceDigest(original))
  const preview = await project.preview(await candidate(original.replace('first = 1', 'first = 3')))
  expect(preview.conflicts).toContain('src/webmcp.ts')
  await project.merge(preview.token)
  project = new WebMCPProject(workspace)
  expect((await project.state())?.merging).toBe(true)
  await expect(project.finish()).rejects.toThrow('Resolve conflict markers')
  await project.abort()
  expect((await project.read())?.source).toBe(local)
  expect((await project.state())?.upstream.commit).toBe(base.provenance.commit)
})
it('finishes resolved source conflicts and refreshes the manifest digest without replacing license or skills', async () => {
  await project.start(await candidate(original))
  const local = original.replace('first = 1', 'first = 2')
  await project.write(local, sourceDigest(original)); await project.updateManifest(sourceDigest(local))
  const upstream = await candidate(original.replace('first = 1', 'first = 3'))
  const preview = await project.preview(upstream)
  await project.merge(preview.token)
  expect((await project.state())?.conflicts).not.toContain('webmcp.json') // The derived digest is resolved automatically.
  const resolved = original.replace('first = 1', 'first = 4')
  await project.write(resolved, (await project.read())!.sourceDigest)
  await writeFile(join(project.directory, 'webmcp.json'), JSON.stringify(manifest(resolved)))
  await project.finish()
  expect((await project.state())?.merging).toBe(false)
  expect((await project.state())?.upstream.commit).toBe(upstream.provenance.commit)
  expect((await project.read())?.source).toBe(resolved)
})

it('rejects a stale preview after a file mode changes', async () => {
  await project.start(await candidate(original))
  const preview = await project.preview(await candidate(original + '// upstream\n'))
  await chmod(join(project.directory, 'src/webmcp.ts'), 0o755)
  await expect(project.merge(preview.token)).rejects.toThrow('Local project changed')
  await project.cancel(preview.token)
})

it('preserves real manifest conflicts for explicit resolution', async () => {
  await project.start(await candidate(original))
  const localManifest = { ...manifest(original), description: 'Local description' }
  await writeFile(join(project.directory, 'webmcp.json'), JSON.stringify(localManifest, null, 2))
  const upstream = await candidate(original + '// upstream\n')
  upstream.manifest.description = 'Upstream description'
  await writeFile(join(remote, 'webmcp.json'), JSON.stringify(upstream.manifest, null, 2))
  git(remote, 'add', '-A'); git(remote, 'commit', '-m', 'Update description')
  upstream.provenance.commit = git(remote, 'rev-parse', 'HEAD')
  const preview = await project.preview(upstream)
  expect(preview.conflicts).toContain('webmcp.json')
  await project.merge(preview.token)
  await expect(project.finish()).rejects.toThrow('Resolve conflict markers')
  await project.abort()
  expect(JSON.parse(await readFile(join(project.directory, 'webmcp.json'), 'utf8')).description).toBe('Local description')
})

it('does not overwrite ignored local files or leave a false merge state after a failed merge', async () => {
  await project.start(await candidate(original))
  await writeFile(join(project.directory, '.gitignore'), 'local.txt\n')
  await writeFile(join(remote, 'local.txt'), 'Upstream file')
  const preview = await project.preview(await candidate(original + '// upstream\n'))
  expect(preview.conflicts).toEqual([])
  await writeFile(join(project.directory, 'local.txt'), 'Local content to preserve')
  await expect(project.merge(preview.token)).rejects.toThrow('overwrite ignored local file')
  expect(await readFile(join(project.directory, 'local.txt'), 'utf8')).toBe('Local content to preserve')
  expect((await project.state())?.merging).toBe(false)
  await project.cancel(preview.token)
})
