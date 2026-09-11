import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { GitHubWebMCP } from '../plugins/browser/src/github-webmcp.ts'
import { packagePath, parseCatalog, record, repositoryUrl, type WebMCPCatalogEntry } from '../plugins/browser/src/webmcp-package.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const destination = join(root, 'apps/web/public/webmcp/catalog.json')
const previous = parseCatalog(JSON.parse(await readFile(destination, 'utf8')))
const github = new GitHubWebMCP(fetch, process.env.GH_TOKEN)
const entries: WebMCPCatalogEntry[] = []
const seenIds = new Set<string>(); const seenRepos = new Set<string>()
const references = []
for (const file of (await readdir(join(root, 'registry/webmcp/entries'))).filter(name => name.endsWith('.json')).sort()) {
  const ref: unknown = JSON.parse(await readFile(join(root, 'registry/webmcp/entries', file), 'utf8'))
  if (!record(ref) || typeof ref.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(ref.id) || !Number.isSafeInteger(ref.repositoryId) || Number(ref.repositoryId) <= 0) throw new Error(`Invalid reference: ${file}`)
  const repository = repositoryUrl(ref.repository); const manifestPath = packagePath(ref.manifestPath)
  const key = `${ref.repositoryId}:${manifestPath}`
  if (seenIds.has(ref.id) || seenRepos.has(key)) throw new Error(`Duplicate reference: ${file}`)
  seenIds.add(ref.id); seenRepos.add(key)
  references.push({ id: ref.id, repositoryId: Number(ref.repositoryId), repository, manifestPath })
}
let failed = false
for (const ref of references) {
  try {
    const repo = await github.repository(ref.repository)
    if (repo.repositoryId !== ref.repositoryId) throw new Error('Repository identity changed.')
    const value = await github.load(ref.repository, ref.manifestPath, undefined, ref.repositoryId, true)
    if (value.manifest.license === 'UNLICENSED') throw new Error('Choose a redistribution license before directory submission.')
    entries.push({ ...ref, author: repo.author, repository: repo.repository, name: value.manifest.name, description: value.manifest.description, origin: value.manifest.origin, tags: value.manifest.tags, status: repo.archived ? 'archived' : 'active', syncedAt: new Date().toISOString(), ...(value.provenance.release ? { version: value.manifest.version } : {}), commit: value.provenance.commit })
  } catch (error) {
    failed = true
    const old = previous.entries.find(entry => entry.id === ref.id && entry.repositoryId === ref.repositoryId && entry.manifestPath === ref.manifestPath && entry.repository.toLowerCase() === ref.repository.toLowerCase())
    if (old) entries.push({ ...old, syncError: 'GitHub synchronization failed; check the upstream repository.' })
    console.error(`${ref.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
const catalog = parseCatalog({ formatVersion: 1, generatedAt: new Date().toISOString(), entries })
await mkdir(join(root, 'apps/web/public/webmcp'), { recursive: true })
const temporary = `${destination}.${process.pid}.tmp`
await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n')
await rename(temporary, destination)
const bundledDestination = join(root, 'plugins/browser/catalog.json')
const bundledTemporary = `${bundledDestination}.${process.pid}.tmp`
await writeFile(bundledTemporary, JSON.stringify(catalog, null, 2) + '\n')
await rename(bundledTemporary, bundledDestination)
console.log(`Indexed ${entries.length} WebMCP projects.`)
if (failed) process.exitCode = 1
