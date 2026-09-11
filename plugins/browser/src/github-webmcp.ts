import { boundedResponse } from './bounded-response.js'
export { boundedResponse } from './bounded-response.js'
import { createHash } from 'node:crypto'
import { githubAuthor, type GitHubAuthor, packagePath, parsePackage, parseProvenance, record, repositoryUrl, type GitHubSource, type WebMCPPackage } from './webmcp-package.js'

class GitHubResponseError extends Error { constructor(readonly status: number) { super(`GitHub request failed (${status}). Check repository access, releases and API rate limits.`) } }

export class GitHubWebMCP {
  constructor(private readonly request: typeof fetch = fetch, private readonly token?: string) {}
  private async api(path: string): Promise<Record<string, unknown>> {
    const response = await this.request(`https://api.github.com${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'DeepDeck-WebMCP', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) } })
    if (!response.ok) { await response.body?.cancel(); throw new GitHubResponseError(response.status) }
    const value: unknown = JSON.parse(await boundedResponse(response, 2 * 1024 * 1024))
    if (!record(value)) throw new Error('Invalid GitHub response.')
    return value
  }
  async repository(url: string): Promise<{ repository: string; repositoryId: number; archived: boolean; defaultBranch: string; author: GitHubAuthor }> {
    const repository = repositoryUrl(url)
    const value = await this.api(`/repos/${repository.slice('https://github.com/'.length)}`)
    if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0 || value.private !== false || typeof value.default_branch !== 'string') throw new Error('A public GitHub repository is required.')
    return { repository: repositoryUrl(value.html_url), repositoryId: Number(value.id), archived: value.archived === true, defaultBranch: value.default_branch, author: githubAuthor(record(value.owner) ? value.owner : { login: repositoryUrl(value.html_url).split('/')[3] }) }
  }
  async load(url: string, manifestPath = 'webmcp.json', commit?: string, expectedRepositoryId?: number, allowUnreleased = false): Promise<{ manifest: WebMCPPackage; source: string; provenance: GitHubSource }> {
    const repo = await this.repository(url)
    if (expectedRepositoryId !== undefined && expectedRepositoryId !== repo.repositoryId) throw new Error('The GitHub repository identity changed. Review its new ownership before installing.')
    const base = `/repos/${repo.repository.slice('https://github.com/'.length)}`
    let release: string | undefined
    if (commit !== undefined) {
      if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error('Choose a full 40-character commit SHA or leave it empty for a stable release.')
    } else {
      const value = await this.api(`${base}/releases/latest`).catch(async error => {
        if (!allowUnreleased || !(error instanceof GitHubResponseError) || error.status !== 404) throw error
        const head = await this.api(`${base}/commits/${encodeURIComponent(repo.defaultBranch)}`)
        if (typeof head.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(head.sha)) throw new Error('Invalid default branch commit.')
        commit = head.sha
        return undefined
      })
      if (value) {
      if (value.draft !== false || value.prerelease !== false || typeof value.tag_name !== 'string') throw new Error('No stable GitHub release is available. Choose an explicit commit to test.')
      release = value.tag_name
      let ref = await this.api(`${base}/git/ref/tags/${encodeURIComponent(release)}`)
      for (let count = 0; count < 5; count++) {
        if (!record(ref.object) || typeof ref.object.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(ref.object.sha)) throw new Error('Invalid GitHub tag target.')
        if (ref.object.type === 'commit') { commit = ref.object.sha; break }
        if (ref.object.type !== 'tag') throw new Error('Release does not point to a commit.')
        ref = await this.api(`${base}/git/tags/${ref.object.sha}`)
      }
      if (!commit) throw new Error('Too many nested GitHub tags.')
      }
    }
    const resolved = await this.api(`${base}/git/commits/${commit}`)
    if (resolved.sha !== commit || !record(resolved.tree) || typeof resolved.tree.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(resolved.tree.sha)) throw new Error('Invalid GitHub commit.')
    const trees = new Map<string, Record<string, unknown>>()
    const read = async (path: string, limit: number): Promise<string> => {
      const parts = packagePath(path).split('/'); let tree = String((resolved.tree as Record<string, unknown>).sha)
      for (let index = 0; index < parts.length; index++) {
        let value = trees.get(tree)
        if (!value) { value = await this.api(`${base}/git/trees/${tree}`); trees.set(tree, value) }
        if (value.truncated === true || !Array.isArray(value.tree)) throw new Error('Repository tree is too large or invalid.')
        const item: unknown = value.tree.find((row: unknown) => record(row) && row.path === parts[index])
        if (!record(item) || typeof item.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(item.sha)) throw new Error(`Missing repository file: ${path}`)
        if (index < parts.length - 1) { if (item.type !== 'tree' || item.mode !== '040000') throw new Error('Package paths cannot use symlinks or submodules.'); tree = item.sha; continue }
        if (item.type !== 'blob' || !['100644', '100755'].includes(String(item.mode)) || typeof item.size !== 'number' || item.size > limit) throw new Error('Package file is not ordinary text or exceeds its limit.')
        const blob = await this.api(`${base}/git/blobs/${item.sha}`)
        if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.sha !== item.sha) throw new Error('Invalid source blob.')
        const bytes = Buffer.from(blob.content, 'base64')
        if (bytes.length > limit || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== item.sha) throw new Error('GitHub file failed its integrity check.')
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      }
      throw new Error('Missing repository file.')
    }
    const manifest = parsePackage(JSON.parse(await read(manifestPath, 64 * 1024)))
    if (release && release.replace(/^v/u, '') !== manifest.version) throw new Error('Release tag and manifest version disagree.')
    const source = await read(manifest.entry, 512 * 1024)
    if (source.includes('\0') || createHash('sha256').update(source).digest('hex') !== manifest.sourceSha256) throw new Error('WebMCP source failed its SHA-256 check.')
    return { manifest, source, provenance: parseProvenance({ author: repo.author, repositoryId: repo.repositoryId, repository: repo.repository, manifestPath, commit, version: manifest.version, sourceSha256: manifest.sourceSha256, ...(release ? { release } : {}) }) }
  }
}
