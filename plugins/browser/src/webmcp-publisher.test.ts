import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { publishCommittedPackage, type PublicationInput } from './webmcp-publisher.js'
import { digest, submissionKey } from './webmcp-submission.js'
import { WEBMCP_SUBMISSIONS_URL } from './webmcp-package.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'webmcp-publication-')); roots.push(root)
  const workspace = join(root, 'workspace'), directory = join(workspace, 'project')
  await mkdir(directory, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init'); git('config', 'user.email', 'fixture@example.com'); git('config', 'user.name', 'Fixture')
  git('remote', 'add', 'origin', 'https://github.com/test/project')
  const source = 'globalThis.example = true\n'
  const manifest = { formatVersion: 1, name: 'Fixture', description: 'Fixture package', version: '1.0.0', origin: 'https://example.com', entry: 'webmcp.ts', sourceSha256: digest(source), runtime: { id: 'deepdeck-webmcp', sdkVersion: 1 }, license: 'MIT', tools: [], tags: [] }
  await writeFile(join(directory, 'webmcp.ts'), source); await writeFile(join(directory, 'webmcp.json'), JSON.stringify(manifest))
  git('add', '.'); git('commit', '-m', 'Published package')
  const input: PublicationInput = { workspace, directory, credentialsDirectory: join(root, 'private'), repository: 'https://github.com/test/project', repositoryId: 123, origin: manifest.origin, commit: git('rev-parse', 'HEAD') }
  return { root, git, input, source, manifest }
}

it('publishes committed bytes without GitHub and keeps one private credential across retries and later versions', async () => {
  const { input, source, manifest, git } = await project()
  await writeFile(join(input.directory, 'webmcp.ts'), 'Uncommitted draft must stay local')
  const sent: Array<Record<string, unknown>> = []
  let interrupted = true
  const request: typeof fetch = async (url, options) => {
    expect(url).toBe(WEBMCP_SUBMISSIONS_URL)
    const body = JSON.parse(String(options?.body)); sent.push(body)
    if (interrupted) { interrupted = false; throw new Error('Response lost after accepting publication') }
    return Response.json({ id: submissionKey(input.repository, 'webmcp.json'), entryId: 'fixture', status: 'indexed', commit: body.commit, sourceSha256: body.manifest.sourceSha256 })
  }
  const first = await publishCommittedPackage(input, request)
  expect(first.status).toBe('indexed'); expect(sent[0]?.source).toBe(source); expect(sent[1]).toEqual(sent[0])
  expect(JSON.stringify(first)).not.toContain(sent[0]?.publisherToken)
  expect(await readFile(join(input.directory, 'webmcp.ts'), 'utf8')).toBe('Uncommitted draft must stay local')
  manifest.version = '1.1.0'
  await writeFile(join(input.directory, 'webmcp.json'), JSON.stringify(manifest)); git('add', 'webmcp.json'); git('commit', '-m', 'New version')
  await publishCommittedPackage({ ...input, commit: git('rev-parse', 'HEAD') }, request)
  expect(sent[2]?.publisherToken).toBe(sent[0]?.publisherToken)
  expect(await readdir(input.credentialsDirectory)).toHaveLength(1)
  expect(git('ls-files')).not.toContain('.key')
})

it('rejects a different site, remote, workspace and non-commit before making a publication request', async () => {
  const { input, root } = await project()
  const outside = join(root, 'other'); await mkdir(outside)
  const request: typeof fetch = async () => { throw new Error('Unexpected network request') }
  await expect(publishCommittedPackage({ ...input, origin: 'https://different.example' }, request)).rejects.toThrow('origin')
  await expect(publishCommittedPackage({ ...input, repository: 'https://other.example/project' }, request)).rejects.toThrow('github.com')
  await expect(publishCommittedPackage({ ...input, repository: 'https://github.com/test/other' }, request)).rejects.toThrow('remote')
  await expect(publishCommittedPackage({ ...input, workspace: outside }, request)).rejects.toThrow('Workspace')
  await expect(publishCommittedPackage({ ...input, commit: 'HEAD' }, request)).rejects.toThrow('full published commit')
})
