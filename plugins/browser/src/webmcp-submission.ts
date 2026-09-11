import { createHash } from 'node:crypto'
import { githubAuthor, packagePath, parsePackage, record, repositoryUrl, type WebMCPCatalogEntry, type WebMCPPackage } from './webmcp-package.js'

export const MAX_SUBMISSION_BYTES = 4 * 1024 * 1024
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const submissionKey = (repository: string, manifestPath: string) => digest(`${repositoryUrl(repository).toLowerCase()}:${packagePath(manifestPath)}`)

export interface WebMCPSubmission {
  repository: string
  repositoryId: number
  manifestPath: string
  commit: string
  manifest: WebMCPPackage
  source: string
  publisherToken: string
}

/** Validate submitted bytes only. Repository identity is checked when installing. */
export function parseSubmission(value: unknown): WebMCPSubmission {
  if (!record(value) || !record(value.manifest) || typeof value.source !== 'string') throw new Error('Publish the package manifest and source together; a repository URL alone cannot be indexed.')
  const repository = repositoryUrl(value.repository)
  const manifestPath = packagePath(value.manifestPath ?? 'webmcp.json')
  if (!Number.isSafeInteger(value.repositoryId) || Number(value.repositoryId) <= 0) throw new Error('Include the repository ID returned by the publication workflow.')
  if (typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/.test(value.commit)) throw new Error('Include the full published commit SHA.')
  if (typeof value.publisherToken !== 'string' || !/^[a-f0-9]{64}$/.test(value.publisherToken)) throw new Error('The publication client must provide its saved project update credential.')
  if (Buffer.byteLength(JSON.stringify(value.manifest)) > 64 * 1024) throw new Error('The package manifest exceeds 64 KB.')
  const manifest = parsePackage(value.manifest)
  if (manifest.license.toUpperCase() === 'UNLICENSED') throw new Error('A redistribution license is required.')
  if (Buffer.byteLength(value.source) > 512 * 1024 || value.source.includes('\0')) throw new Error('Source must be ordinary UTF-8 text of at most 512 KB.')
  if (digest(value.source) !== manifest.sourceSha256) throw new Error('WebMCP source failed its SHA-256 check.')
  return { repository, repositoryId: Number(value.repositoryId), manifestPath, commit: value.commit, manifest, source: value.source, publisherToken: value.publisherToken }
}

export function submissionEntry(value: WebMCPSubmission, id: string, now: number): WebMCPCatalogEntry {
  return {
    id, repositoryId: value.repositoryId, repository: value.repository, manifestPath: value.manifestPath,
    author: githubAuthor({ login: new URL(value.repository).pathname.split('/')[1] }),
    name: value.manifest.name, description: value.manifest.description, origin: value.manifest.origin,
    tags: value.manifest.tags, status: 'active', commit: value.commit, version: value.manifest.version,
    syncedAt: new Date(now).toISOString(),
  }
}
