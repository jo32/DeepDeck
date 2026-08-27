import type { AppMarketItem, AppMarketPage } from './contracts.js'

const DSHFIND_ENDPOINT = 'https://api.dshfind.com/market/v1/plugins'
const DSHFIND_ORIGIN = 'https://api.dshfind.com'
const DEFAULT_LIMIT = 24
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_CURSOR_LENGTH = 2048
const MAX_QUERY_LENGTH = 64
const MAX_CACHE_ITEMS = 1_000
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u

type JsonObject = Record<string, unknown>

export interface AppMarketCatalogItem extends Omit<AppMarketItem, 'installed'> {}

export interface AppMarketCatalogPage {
  readonly items: readonly AppMarketCatalogItem[]
  readonly nextCursor?: string
  readonly total?: number
}

export interface AppMarketInventory {
  readonly catalogItemIds: ReadonlySet<string>
  readonly packageNames: ReadonlySet<string>
  readonly repositoryUrls: ReadonlySet<string>
}

export interface AppMarketServiceOptions {
  readonly fetchValue?: typeof fetch
  readonly endpoint?: string
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
  if (!/^[A-Za-z0-9._-]{1,100}(?:\.git)?$/u.test(segments[1]!)) return undefined
  return `https://github.com/${segments[0]!}/${segments[1]!.replace(/\.git$/iu, '')}`
}

function packageSubdirectory(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (
    value.length === 0
    || value.length > 240
    || value.includes('\\')
    || value.startsWith('/')
    || value.endsWith('/')
    || value.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) return undefined
  return value
}

function stringList(value: unknown, maximumItems: number, maximumLength: number, pattern?: RegExp): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumItems) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const text = safeText(entry, maximumLength)
    if (text === undefined || pattern !== undefined && !pattern.test(text) || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

function normalizeRepositoryUrl(value: string): string {
  return value.toLowerCase().replace(/\.git$/u, '').replace(/\/$/u, '')
}

function parseItem(value: unknown): AppMarketCatalogItem | undefined {
  if (!isObject(value)) return undefined
  const id = safeText(value.id, 160)
  const name = safeText(value.name, 160)
  const displayName = safeText(value.displayName, 120)
  const summary = safeText(value.summary, 1_000)
  if (
    id === undefined
    || !IDENTIFIER_PATTERN.test(id)
    || name === undefined
    || displayName === undefined
    || summary === undefined
    || !isObject(value.repository)
  ) return undefined
  const repositoryUrl = githubRepository(value.repository.url)
  if (repositoryUrl === undefined) return undefined
  const rawSubdirectory = value.repository.subdirectory
  const subdirectory = rawSubdirectory === undefined ? undefined : packageSubdirectory(rawSubdirectory)
  if (rawSubdirectory !== undefined && subdirectory === undefined) return undefined

  const description = safeText(value.description, 5_000, true)
  const homepage = optionalHttpsUrl(value.homepage)
  const latestVersion = typeof value.latestVersion === 'string' && SEMVER_PATTERN.test(value.latestVersion)
    ? value.latestVersion
    : undefined
  const license = safeText(value.license, 80)
  const categories = stringList(value.categories, 32, 64, CATEGORY_PATTERN)
  const keywords = stringList(value.keywords, 64, 64)
  const packageName = isObject(value.package)
    && value.package.registry === 'npm'
    && typeof value.package.name === 'string'
    && PACKAGE_NAME_PATTERN.test(value.package.name)
    ? value.package.name
    : undefined
  const publisher = isObject(value.publisher) ? safeText(value.publisher.name, 120) : undefined
  const updatedAt = typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    ? new Date(value.updatedAt).toISOString()
    : undefined

  return Object.freeze({
    id,
    name,
    displayName,
    summary,
    ...(description === undefined ? {} : { description }),
    ...(homepage === undefined ? {} : { homepage }),
    ...(latestVersion === undefined ? {} : { latestVersion }),
    ...(license === undefined ? {} : { license }),
    categories: Object.freeze([...categories]),
    keywords: Object.freeze([...keywords]),
    repository: Object.freeze({
      url: repositoryUrl,
      ...(subdirectory === undefined ? {} : { subdirectory }),
    }),
    ...(packageName === undefined ? {} : { packageName }),
    ...(publisher === undefined ? {} : { publisher }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  })
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('dshfind response is too large')
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
      throw new Error('dshfind response is too large')
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
    throw new Error('market query is invalid')
  }
  return query
}

function validatedCursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH || UNSAFE_TEXT_PATTERN.test(value)) {
    throw new Error('market cursor is invalid')
  }
  return value
}

function reconcileInstalled(item: AppMarketCatalogItem, inventory: AppMarketInventory): AppMarketItem {
  const installed = inventory.catalogItemIds.has(item.id)
    || item.packageName !== undefined && inventory.packageNames.has(item.packageName)
    || inventory.repositoryUrls.has(normalizeRepositoryUrl(item.repository.url))
  return Object.freeze({ ...item, installed })
}

/** Fixed-origin dshfind reader. Provider rows never become executable commands. */
export class DshfindAppMarket {
  private readonly fetchValue: typeof fetch
  private readonly endpoint: string
  private readonly cache = new Map<string, AppMarketCatalogItem>()

  constructor(options: AppMarketServiceOptions = {}) {
    this.fetchValue = options.fetchValue ?? fetch
    this.endpoint = options.endpoint ?? DSHFIND_ENDPOINT
    const endpoint = new URL(this.endpoint)
    if (endpoint.origin !== DSHFIND_ORIGIN || endpoint.pathname !== '/market/v1/plugins') {
      throw new Error('dshfind endpoint is not the reviewed catalog endpoint')
    }
  }

  async list(
    queryValue: string,
    cursorValue: string | undefined,
    inventory: AppMarketInventory,
    signal?: AbortSignal,
  ): Promise<AppMarketPage> {
    const page = await this.catalog(queryValue, cursorValue, signal)
    return Object.freeze({
      items: Object.freeze(page.items.map(item => reconcileInstalled(item, inventory))),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      ...(page.total === undefined ? {} : { total: page.total }),
    })
  }

  async resolve(itemId: string, signal?: AbortSignal): Promise<AppMarketCatalogItem> {
    if (!IDENTIFIER_PATTERN.test(itemId) || itemId.length > 160) throw new Error('market item id is invalid')
    const cached = this.cache.get(itemId)
    if (cached !== undefined) return cached
    const page = await this.catalog(itemId, undefined, signal, 100)
    const item = page.items.find(candidate => candidate.id === itemId)
    if (item === undefined) throw new Error('dshfind plugin is no longer available')
    return item
  }

  private async catalog(
    queryValue: string,
    cursorValue: string | undefined,
    signal?: AbortSignal,
    limit = DEFAULT_LIMIT,
  ): Promise<AppMarketCatalogPage> {
    const query = validatedQuery(queryValue)
    const cursor = validatedCursor(cursorValue)
    const url = new URL(this.endpoint)
    url.searchParams.set('limit', String(limit))
    if (query.length > 0) url.searchParams.set('q', query)
    if (cursor !== undefined) url.searchParams.set('cursor', cursor)
    const response = await this.fetchValue(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'identity',
        'user-agent': 'deepdeck-app-market/1.0',
      },
      ...(signal === undefined ? {} : { signal }),
    })
    if (response.status >= 300 && response.status < 400) throw new Error('dshfind redirected outside the reviewed request')
    if (!response.ok) throw new Error(`dshfind request failed with HTTP ${String(response.status)}`)
    if (response.url.length > 0 && new URL(response.url).origin !== DSHFIND_ORIGIN) {
      throw new Error('dshfind response changed origin')
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^(?:application\/json|application\/[^;]+\+json)(?:;|$)/iu.test(contentType)) {
      throw new Error('dshfind response is not JSON')
    }
    const value = await boundedJson(response)
    if (!isObject(value) || value.schemaVersion !== '1.0.0' || !Array.isArray(value.items) || !isObject(value.page)) {
      throw new Error('dshfind catalog response is invalid')
    }
    if (value.items.length > limit || value.items.length > 100) throw new Error('dshfind page exceeded its requested limit')
    const items = value.items.map(parseItem).filter((item): item is AppMarketCatalogItem => item !== undefined)
    const ids = new Set(items.map(item => item.id))
    if (ids.size !== items.length) throw new Error('dshfind page contains duplicate plugin ids')
    const nextCursor = validatedCursor(typeof value.page.nextCursor === 'string' ? value.page.nextCursor : undefined)
    const total = Number.isSafeInteger(value.page.total) && (value.page.total as number) >= 0
      ? value.page.total as number
      : undefined
    for (const item of items) {
      this.cache.delete(item.id)
      this.cache.set(item.id, item)
      while (this.cache.size > MAX_CACHE_ITEMS) this.cache.delete(this.cache.keys().next().value as string)
    }
    return Object.freeze({
      items: Object.freeze(items),
      ...(nextCursor === undefined ? {} : { nextCursor }),
      ...(total === undefined ? {} : { total }),
    })
  }
}

export function emptyAppMarketInventory(): AppMarketInventory {
  return {
    catalogItemIds: new Set(),
    packageNames: new Set(),
    repositoryUrls: new Set(),
  }
}
