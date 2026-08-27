import { Buffer } from 'node:buffer'
import type { AppMarketCatalogItem, AppMarketInventory } from './app-market.js'
import type { AppMarketPage } from './contracts.js'

const GITHUB_SEARCH_ENDPOINT = 'https://api.github.com/search/repositories'
const GITHUB_ORIGIN = 'https://api.github.com'
const REQUIRED_TOPICS = ['deepdeck'] as const
const HOST_REPOSITORIES = new Set(['jo32/deepdeck'])
const DEFAULT_LIMIT = 24
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_QUERY_LENGTH = 64
const MAX_PAGE = 42
const MAX_MANIFEST_BYTES = 256 * 1024
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u

type JsonObject = Record<string, unknown>

export interface DeepDeckAppStoreOptions {
  readonly fetchValue?: typeof fetch
  readonly endpoint?: string
}

interface AppStoreCandidate {
  readonly item: AppMarketCatalogItem
  readonly fullName: string
  readonly defaultBranch: string
}

interface AppManifestIdentity {
  readonly title: string
  readonly packageName: string
  readonly version?: string
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value: unknown, maximum: number, allowEmpty = false): string | undefined {
  if (typeof value !== 'string' || value.length > maximum || UNSAFE_TEXT_PATTERN.test(value)) return undefined
  if (!allowEmpty && value.trim().length === 0) return undefined
  return value
}

function optionalHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) return undefined
    return url.href
  } catch {
    return undefined
  }
}

function githubRepository(value: unknown): string | undefined {
  const href = optionalHttpsUrl(value)
  if (href === undefined) return undefined
  const url = new URL(href)
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname.toLowerCase() !== 'github.com' || url.search || segments.length !== 2) return undefined
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,99})$/u.test(segments[0]!)) return undefined
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(segments[1]!)) return undefined
  return `https://github.com/${segments[0]!}/${segments[1]!}`
}

function stringList(value: unknown, maximumItems: number, maximumLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumItems) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const text = safeText(entry, maximumLength)?.toLowerCase()
    if (text === undefined || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

function normalizeRepositoryUrl(value: string): string {
  return value.toLowerCase().replace(/\.git$/u, '').replace(/\/$/u, '')
}

function parseItem(value: unknown): AppStoreCandidate | undefined {
  if (!isObject(value) || value.archived === true || value.disabled === true) return undefined
  const name = safeText(value.name, 100)
  const repositoryUrl = githubRepository(value.html_url)
  const topics = stringList(value.topics, 32, 64)
  const defaultBranch = safeText(value.default_branch, 255)
  if (
    name === undefined
    || repositoryUrl === undefined
    || defaultBranch === undefined
    || !REQUIRED_TOPICS.every(topic => topics.includes(topic))
  ) return undefined
  const fullName = new URL(repositoryUrl).pathname.slice(1)
  if (safeText(value.full_name, 201)?.toLowerCase() !== fullName.toLowerCase()) return undefined
  if (HOST_REPOSITORIES.has(fullName.toLowerCase())) return undefined
  const description = safeText(value.description, 1_000, true)
  const homepage = optionalHttpsUrl(value.homepage)
  const publisher = isObject(value.owner) ? safeText(value.owner.login, 120) : undefined
  const license = isObject(value.license) ? safeText(value.license.spdx_id, 80) : undefined
  const updatedAt = typeof value.updated_at === 'string' && Number.isFinite(Date.parse(value.updated_at))
    ? new Date(value.updated_at).toISOString()
    : undefined

  return Object.freeze({
    fullName,
    defaultBranch,
    item: Object.freeze({
      id: `github:${fullName}`,
      name,
      displayName: name,
      summary: description?.trim() || name,
      ...(description === undefined ? {} : { description }),
      ...(homepage === undefined ? {} : { homepage }),
      ...(license === undefined ? {} : { license }),
      categories: Object.freeze([...topics]),
      keywords: Object.freeze([...topics]),
      repository: Object.freeze({ url: repositoryUrl }),
      ...(publisher === undefined ? {} : { publisher }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    }),
  })
}

function parseManifest(value: unknown): AppManifestIdentity | undefined {
  if (!isObject(value) || !isObject(value.dsh) || !isObject(value.dsh.app)) return undefined
  const title = safeText(value.dsh.app.title, 120)
  const appId = safeText(value.dsh.app.id, 64)
  const packageName = safeText(value.name, 214)
  const version = typeof value.version === 'string' && SEMVER_PATTERN.test(value.version)
    ? value.version
    : undefined
  if (
    title === undefined
    || appId === undefined
    || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(appId)
    || packageName === undefined
    || !PACKAGE_NAME_PATTERN.test(packageName)
  ) return undefined
  return Object.freeze({ title, packageName, ...(version === undefined ? {} : { version }) })
}

function reconcileInstalled(item: AppMarketCatalogItem, inventory: AppMarketInventory) {
  const installed = inventory.catalogItemIds.has(item.id)
    || item.packageName !== undefined && inventory.packageNames.has(item.packageName)
    || inventory.repositoryUrls.has(normalizeRepositoryUrl(item.repository.url))
  return Object.freeze({ ...item, installed })
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('GitHub response is too large')
  if (response.body === null) return await response.json() as unknown
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new Error('GitHub response is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function validatedQuery(value: string): string {
  const query = value.trim()
  if (Array.from(query).length > MAX_QUERY_LENGTH || UNSAFE_TEXT_PATTERN.test(query)) {
    throw new Error('App search query is invalid')
  }
  return query
}

function validatedPage(value: string | undefined): number {
  if (value === undefined) return 1
  if (!/^\d{1,2}$/u.test(value)) throw new Error('App search cursor is invalid')
  const page = Number(value)
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) throw new Error('App search cursor is invalid')
  return page
}

/** GitHub topic-backed catalog for repositories that opt into the DeepDeck App contract. */
export class DeepDeckAppStore {
  private readonly fetchValue: typeof fetch
  private readonly endpoint: string
  private readonly manifests = new Map<string, AppManifestIdentity | null>()

  constructor(options: DeepDeckAppStoreOptions = {}) {
    this.fetchValue = options.fetchValue ?? fetch
    this.endpoint = options.endpoint ?? GITHUB_SEARCH_ENDPOINT
    const endpoint = new URL(this.endpoint)
    if (endpoint.origin !== GITHUB_ORIGIN || endpoint.pathname !== '/search/repositories') {
      throw new Error('GitHub endpoint is not the reviewed repository search endpoint')
    }
  }

  async list(
    queryValue: string,
    cursorValue: string | undefined,
    inventory: AppMarketInventory,
    signal?: AbortSignal,
  ): Promise<AppMarketPage> {
    const query = validatedQuery(queryValue)
    const page = validatedPage(cursorValue)
    const url = new URL(this.endpoint)
    const terms = [...REQUIRED_TOPICS.map(topic => `topic:${topic}`)]
    if (query.length > 0) terms.push(`\"${query.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}\"`)
    url.searchParams.set('q', terms.join(' '))
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', String(DEFAULT_LIMIT))
    url.searchParams.set('page', String(page))
    const response = await this.fetchValue(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'application/vnd.github+json',
        'accept-encoding': 'identity',
        'user-agent': 'deepdeck-app-store/1.0',
        'x-github-api-version': '2022-11-28',
      },
      ...(signal === undefined ? {} : { signal }),
    })
    if (response.status >= 300 && response.status < 400) throw new Error('GitHub redirected outside the reviewed request')
    if (!response.ok) throw new Error(`GitHub App search failed with HTTP ${String(response.status)}`)
    if (response.url.length > 0 && new URL(response.url).origin !== GITHUB_ORIGIN) {
      throw new Error('GitHub response changed origin')
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^(?:application\/json|application\/[^;]+\+json)(?:;|$)/iu.test(contentType)) {
      throw new Error('GitHub App search response is not JSON')
    }
    const value = await boundedJson(response)
    if (!isObject(value) || !Array.isArray(value.items)) throw new Error('GitHub App search response is invalid')
    if (value.items.length > DEFAULT_LIMIT) throw new Error('GitHub App search exceeded its requested limit')
    const total = Number.isSafeInteger(value.total_count) && (value.total_count as number) >= 0
      ? Math.min(value.total_count as number, 1_000)
      : undefined
    const candidates = value.items.map(parseItem).filter((item): item is AppStoreCandidate => item !== undefined)
    const identities = await Promise.all(candidates.map(async candidate => await this.manifest(candidate, signal)))
    const items = candidates.flatMap((candidate, index) => {
      const identity = identities[index]
      if (identity === undefined) return []
      return [{
        ...candidate.item,
        displayName: identity.title,
        packageName: identity.packageName,
        ...(identity.version === undefined ? {} : { latestVersion: identity.version }),
      } satisfies AppMarketCatalogItem]
    })
    const nextPage = total !== undefined && page * DEFAULT_LIMIT < total && page < MAX_PAGE
      ? String(page + 1)
      : undefined
    const verifiedTotal = page === 1 && nextPage === undefined ? items.length : undefined
    return Object.freeze({
      items: Object.freeze(items.map(item => reconcileInstalled(item, inventory))),
      ...(nextPage === undefined ? {} : { nextCursor: nextPage }),
      ...(verifiedTotal === undefined ? {} : { total: verifiedTotal }),
    })
  }

  private async manifest(candidate: AppStoreCandidate, signal?: AbortSignal): Promise<AppManifestIdentity | undefined> {
    const cached = this.manifests.get(candidate.item.repository.url)
    if (cached !== undefined || this.manifests.has(candidate.item.repository.url)) return cached ?? undefined
    const [owner, repository] = candidate.fullName.split('/') as [string, string]
    const url = new URL(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/package.json`, GITHUB_ORIGIN)
    url.searchParams.set('ref', candidate.defaultBranch)
    const response = await this.fetchValue(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'application/vnd.github+json',
        'accept-encoding': 'identity',
        'user-agent': 'deepdeck-app-store/1.0',
        'x-github-api-version': '2022-11-28',
      },
      ...(signal === undefined ? {} : { signal }),
    })
    if (response.status === 404) {
      this.manifests.set(candidate.item.repository.url, null)
      return undefined
    }
    if (response.status >= 300 && response.status < 400) throw new Error('GitHub redirected outside the reviewed request')
    if (!response.ok) throw new Error(`GitHub App manifest request failed with HTTP ${String(response.status)}`)
    if (response.url.length > 0 && new URL(response.url).origin !== GITHUB_ORIGIN) {
      throw new Error('GitHub response changed origin')
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^(?:application\/json|application\/[^;]+\+json)(?:;|$)/iu.test(contentType)) {
      throw new Error('GitHub App manifest response is not JSON')
    }
    const value = await boundedJson(response)
    if (!isObject(value) || value.type !== 'file' || value.encoding !== 'base64' || typeof value.content !== 'string') {
      throw new Error('GitHub App manifest response is invalid')
    }
    const bytes = Buffer.from(value.content.replaceAll(/\s/gu, ''), 'base64')
    if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error('GitHub App manifest is too large')
    const identity = parseManifest(JSON.parse(bytes.toString('utf8')) as unknown)
    this.manifests.set(candidate.item.repository.url, identity ?? null)
    return identity
  }
}
