import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { boundedResponse, GitHubWebMCP } from './github-webmcp.js'
import { packagePath, parseCatalog, parsePackage, repositoryUrl } from './webmcp-package.js'

const sha = (source: string) => createHash('sha256').update(source).digest('hex')
const blob = (source: string) => createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0${source}`).digest('hex')
const COMMIT = 'a'.repeat(40), TREE = 'b'.repeat(40), SRC = 'c'.repeat(40), TAG = 'd'.repeat(40)
const SOURCE = 'globalThis.__deepdeckWebMCP.registerTool({name:"read",description:"Read",inputSchema:{type:"object"},execute:()=>({ok:true})});'
const manifest = { formatVersion: 1, name: 'Example', description: 'Read articles', origin: 'https://example.com', version: '1.0.0', entry: 'src/webmcp.ts', runtime: { id: 'deepdeck-webmcp', sdkVersion: 1 }, sourceSha256: sha(SOURCE), license: 'MIT', tools: [], tags: ['read'] }
function fixture(options: { symlink?: boolean; missingRelease?: boolean; wrongDigest?: boolean; changedIdentity?: boolean } = {}) {
  const json = JSON.stringify({ ...manifest, ...(options.wrongDigest ? { sourceSha256: '0'.repeat(64) } : {}) })
  const routes: Record<string, unknown> = {
    '': { id: options.changedIdentity ? 2 : 1, private: false, archived: false, default_branch: 'main', html_url: 'https://github.com/test/webmcp' },
    '/releases/latest': { draft: false, prerelease: false, tag_name: 'v1.0.0' },
    '/git/ref/tags/v1.0.0': { object: { type: 'tag', sha: TAG } },
    [`/git/tags/${TAG}`]: { object: { type: 'commit', sha: COMMIT } },
    '/commits/main': { sha: COMMIT },
    [`/git/commits/${COMMIT}`]: { sha: COMMIT, tree: { sha: TREE } },
    [`/git/trees/${TREE}`]: { tree: [{ path: 'webmcp.json', mode: '100644', type: 'blob', size: json.length, sha: blob(json) }, { path: 'src', mode: options.symlink ? '120000' : '040000', type: options.symlink ? 'blob' : 'tree', sha: SRC }] },
    [`/git/trees/${SRC}`]: { tree: [{ path: 'webmcp.ts', mode: '100644', type: 'blob', size: SOURCE.length, sha: blob(SOURCE) }] },
    [`/git/blobs/${blob(json)}`]: { sha: blob(json), encoding: 'base64', content: Buffer.from(json).toString('base64') },
    [`/git/blobs/${blob(SOURCE)}`]: { sha: blob(SOURCE), encoding: 'base64', content: Buffer.from(SOURCE).toString('base64') },
  }
  const request = vi.fn(async (input: string | URL | Request) => {
    const path = String(input).replace('https://api.github.com/repos/test/webmcp', '')
    const value = options.missingRelease && path === '/releases/latest' ? undefined : routes[path]
    return new Response(JSON.stringify(value ?? {}), { status: value === undefined ? 404 : 200 })
  })
  return { request, client: new GitHubWebMCP(request as typeof fetch) }
}
describe('GitHub WebMCP immutable resolution', () => {
  it('peels annotated release tags and validates exact Git blobs and source SHA-256', async () => {
    const { client, request } = fixture()
    const result = await client.load('https://github.com/test/webmcp', 'webmcp.json', undefined, 1)
    expect(result).toMatchObject({ source: SOURCE, manifest, provenance: { repositoryId: 1, commit: COMMIT, release: 'v1.0.0' } })
    expect(request.mock.calls.every(([url]) => !String(url).includes('/contents/'))).toBe(true)
  })
  it('uses an explicit commit without resolving latest or accepting a branch', async () => {
    const { client, request } = fixture()
    expect((await client.load('https://github.com/test/webmcp', undefined, COMMIT)).provenance.release).toBeUndefined()
    expect(request.mock.calls.some(([url]) => String(url).includes('/releases/'))).toBe(false)
    await expect(client.load('https://github.com/test/webmcp', undefined, 'main')).rejects.toThrow('full 40-character')
  })
  it('indexes unreleased code only when explicitly requested by the indexer', async () => {
    const { client } = fixture({ missingRelease: true })
    await expect(client.load('https://github.com/test/webmcp')).rejects.toThrow('404')
    const value = await client.load('https://github.com/test/webmcp', undefined, undefined, 1, true)
    expect(value.provenance).toMatchObject({ commit: COMMIT }); expect(value.provenance.release).toBeUndefined()
  })
  it.each([{ symlink: true }, { wrongDigest: true }, { changedIdentity: true }])('rejects unsafe content or changed identity: %s', async options => {
    await expect(fixture(options).client.load('https://github.com/test/webmcp', undefined, undefined, 1)).rejects.toThrow()
  })
  it('bounds streamed bodies even when a server omits content-length', async () => {
    await expect(boundedResponse(new Response('too long'), 3)).rejects.toThrow('size limit')
  })
  it.each(['https://github.com@evil.test/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b?token=secret'])('rejects non-repository URLs: %s', value => { expect(() => repositoryUrl(value)).toThrow() })
  it.each(['../source.ts', '/source.ts', 'src//file.ts', 'src/%2e%2e/file.ts'])('rejects unsafe entry paths: %s', value => { expect(() => packagePath(value)).toThrow() })
  it('rejects unsupported SDK versions and duplicate directory identities', () => {
    expect(() => parsePackage({ ...manifest, runtime: { id: 'deepdeck-webmcp', sdkVersion: 2 } })).toThrow('Unsupported')
    const entry = { id: 'test', repositoryId: 1, repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', name: 'Test', description: 'Read', origin: manifest.origin, tags: [], status: 'active' }
    expect(() => parseCatalog({ formatVersion: 1, generatedAt: null, entries: [entry, { ...entry, id: 'copy' }] })).toThrow('Duplicate')
  })
})
