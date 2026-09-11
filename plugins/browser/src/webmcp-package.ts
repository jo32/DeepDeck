/** Shared, browser-safe GitHub package and directory contract. */
export const WEBMCP_MARKET_URL = 'https://deepdeck.getmegaportal.com/webmcp'
export const WEBMCP_CATALOG_URL = 'https://deepdeck.getmegaportal.com/api/webmcp/catalog'
export const WEBMCP_REGISTRY_URL = 'https://deepdeck.getmegaportal.com/webmcp#submit'
export const WEBMCP_SUBMISSIONS_URL = 'https://deepdeck.getmegaportal.com/api/webmcp/submissions'
export const WEBMCP_GUIDE_URL = 'https://github.com/jo32/DeepDeck/tree/main/registry/webmcp'
export interface WebMCPPackage {
  formatVersion: 1
  name: string
  description: string
  version: string
  origin: string
  entry: string
  sourceSha256: string
  runtime: { id: 'deepdeck-webmcp'; sdkVersion: 1 }
  license: string
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
  tags: string[]
}
export interface GitHubAuthor { login: string; url: string; avatarUrl: string }
/** GitHub account URLs are derived from a validated login, never arbitrary image URLs. */
export function githubAuthor(value: unknown): GitHubAuthor {
  if (!record(value) || typeof value.login !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u.test(value.login)) throw new Error('Invalid GitHub author.')
  return { login: value.login, url: `https://github.com/${value.login}`, avatarUrl: `https://github.com/${value.login}.png?size=80` }
}
export interface GitHubSource {
  author?: GitHubAuthor
  repositoryId: number
  repository: string
  manifestPath: string
  commit: string
  release?: string
  releaseUrl?: string
  version: string
  sourceSha256: string
}
export interface WebMCPCatalogEntry {
  author?: GitHubAuthor
  id: string
  repositoryId: number
  repository: string
  manifestPath: string
  name: string
  description: string
  origin: string
  tags: string[]
  status: 'active' | 'archived' | 'unavailable'
  syncedAt?: string
  syncError?: string
  version?: string
  commit?: string
}
export interface WebMCPCatalog { formatVersion: 1; generatedAt: string | null; entries: WebMCPCatalogEntry[] }
export interface WebMCPPreview {
  token: string
  manifest: WebMCPPackage
  provenance: GitHubSource
  source: string
  previousRevision?: string
  hasDraft: boolean
  expiresAt: string
}
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new Error(`Invalid ${label}.`)
  return value
}
export function repositoryUrl(value: unknown): string {
  const url = new URL(text(value, 'GitHub repository URL', 300))
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) throw new Error('Use a public https://github.com/owner/repository URL.')
  const path = url.pathname.replace(/\/$/u, '').replace(/\.git$/u, '')
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/u.test(path) || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Use the repository URL, without a branch or file path.')
  return `${url.origin}${path}`
}
export function packagePath(value: unknown): string {
  const path = text(value, 'repository file path', 240)
  if (!/^[a-zA-Z0-9_./-]+$/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || path.split('/').length > 8) throw new Error('Use a relative ordinary file path inside the repository.')
  return path
}
export function packageOrigin(value: unknown): string {
  const url = new URL(text(value, 'site origin', 300))
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || !url.hostname.includes('.') || /^[\d.]+$/u.test(url.hostname) || url.hostname.startsWith('[') || /\.(?:localhost|local|internal)$/iu.test(url.hostname)) throw new Error('Packages require an exact public HTTPS site origin, without a path.')
  return url.origin
}
export function parsePackage(value: unknown): WebMCPPackage {
  if (!record(value) || value.formatVersion !== 1 || !record(value.runtime) || value.runtime.id !== 'deepdeck-webmcp' || value.runtime.sdkVersion !== 1) throw new Error('Unsupported WebMCP package or SDK version.')
  const version = text(value.version, 'package version', 80)
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/u.test(version)) throw new Error('Package version must use major.minor.patch.')
  if (typeof value.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sourceSha256)) throw new Error('Invalid source SHA-256.')
  if (!Array.isArray(value.tools) || value.tools.length > 100 || !Array.isArray(value.tags) || value.tags.length > 20) throw new Error('Invalid tool directory or tags.')
  const tools = value.tools.map(tool => {
    if (!record(tool) || !record(tool.inputSchema) || tool.inputSchema.type !== 'object') throw new Error('Invalid tool schema.')
    const name = text(tool.name, 'tool name', 100)
    if (!/^[a-zA-Z0-9_-]+$/u.test(name)) throw new Error('Invalid tool name.')
    return { name, description: text(tool.description, 'tool description', 2000), inputSchema: tool.inputSchema }
  })
  if (new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error('Duplicate tool names.')
  return { formatVersion: 1, name: text(value.name, 'package name', 120), description: text(value.description, 'package description', 2000), version,
    origin: packageOrigin(value.origin), entry: packagePath(value.entry), sourceSha256: value.sourceSha256,
    runtime: { id: 'deepdeck-webmcp', sdkVersion: 1 }, license: text(value.license, 'license', 120), tools,
    tags: value.tags.map(tag => text(tag, 'tag', 60)) }
}
export function parseProvenance(value: unknown): GitHubSource {
  if (!record(value) || !Number.isSafeInteger(value.repositoryId) || Number(value.repositoryId) <= 0 || typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.commit) || typeof value.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sourceSha256)) throw new Error('Invalid GitHub provenance.')
  const repository = repositoryUrl(value.repository)
  const source: GitHubSource = { repositoryId: Number(value.repositoryId), repository, manifestPath: packagePath(value.manifestPath), commit: value.commit, version: text(value.version, 'version', 80), sourceSha256: value.sourceSha256 }
  if (value.release !== undefined) {
    source.release = text(value.release, 'release tag', 200)
    source.releaseUrl = `${repository}/releases/tag/${encodeURIComponent(source.release)}`
  }
  if (value.author !== undefined) source.author = githubAuthor(value.author)
  return source
}
export function parseCatalog(value: unknown): WebMCPCatalog {
  if (!record(value) || value.formatVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 5000 || value.generatedAt !== null && (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt)))) throw new Error('Invalid WebMCP directory.')
  const entries = value.entries.map(item => {
    if (!record(item) || !Number.isSafeInteger(item.repositoryId) || Number(item.repositoryId) <= 0 || !['active', 'archived', 'unavailable'].includes(String(item.status)) || !Array.isArray(item.tags) || item.tags.length > 20) throw new Error('Invalid directory entry.')
    const entry: WebMCPCatalogEntry = { id: text(item.id, 'entry ID', 100), repositoryId: Number(item.repositoryId), repository: repositoryUrl(item.repository), manifestPath: packagePath(item.manifestPath), name: text(item.name, 'name', 120), description: text(item.description, 'description', 2000), origin: packageOrigin(item.origin), tags: item.tags.map(tag => text(tag, 'tag', 60)), status: item.status as WebMCPCatalogEntry['status'] }
    if (item.author !== undefined) entry.author = githubAuthor(item.author)
    if (item.syncedAt !== undefined) entry.syncedAt = text(item.syncedAt, 'sync time', 40)
    if (item.syncError !== undefined) entry.syncError = text(item.syncError, 'sync error', 300)
    if (item.version !== undefined) entry.version = text(item.version, 'version', 80)
    if (item.commit !== undefined) { if (typeof item.commit !== 'string' || !/^[a-f0-9]{40}$/u.test(item.commit)) throw new Error('Invalid commit.'); entry.commit = item.commit }
    return entry
  })
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || new Set(entries.map(entry => `${entry.repositoryId}:${entry.manifestPath}`)).size !== entries.length) throw new Error('Duplicate directory entries.')
  return { formatVersion: 1, generatedAt: value.generatedAt as string | null, entries }
}
