import { DshfindAppMarket, type AppMarketInventory } from './app-market.js'
import type { AppMarketItem, AppMarketPage } from './contracts.js'

const RAW_GITHUB_ORIGIN = 'https://raw.githubusercontent.com'
const DEFAULT_DISCOVERY_QUERY = 'deepdeck'
const HOST_REPOSITORIES = new Set(['jo32/deepdeck'])
const MAX_CACHE_ITEMS = 1_000
const MAX_MANIFEST_BYTES = 256 * 1024
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u

type JsonObject = Record<string, unknown>

export interface DeepDeckAppStoreOptions {
  readonly fetchValue?: typeof fetch
  readonly endpoint?: string
}

interface AppManifestIdentity {
  readonly title: string
  readonly packageName: string
  readonly version?: string
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.length > maximum || UNSAFE_TEXT_PATTERN.test(value)) return undefined
  if (value.trim().length === 0) return undefined
  return value
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

function repositoryName(repositoryUrl: string): string | undefined {
  const url = new URL(repositoryUrl)
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname.toLowerCase() !== 'github.com' || segments.length !== 2) return undefined
  return `${segments[0]!}/${segments[1]!}`
}

function rawManifestUrl(item: AppMarketItem): URL | undefined {
  const fullName = repositoryName(item.repository.url)
  if (fullName === undefined) return undefined
  const [owner, repository] = fullName.split('/') as [string, string]
  const path = [
    owner,
    repository,
    'HEAD',
    ...(item.repository.subdirectory?.split('/') ?? []),
    'package.json',
  ].map(segment => encodeURIComponent(segment)).join('/')
  return new URL(`/${path}`, RAW_GITHUB_ORIGIN)
}

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_MANIFEST_BYTES) throw new Error('DeepDeck App manifest is too large')
  if (response.body === null) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) {
      throw new Error('DeepDeck App manifest is too large')
    }
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_MANIFEST_BYTES) {
      await reader.cancel()
      throw new Error('DeepDeck App manifest is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** dshfind-backed App discovery with raw, fail-closed dsh.app identity validation. */
export class DeepDeckAppStore {
  private readonly fetchValue: typeof fetch
  private readonly market: DshfindAppMarket
  private readonly manifests = new Map<string, AppManifestIdentity | null>()
  private readonly items = new Map<string, AppMarketItem>()

  constructor(options: DeepDeckAppStoreOptions = {}) {
    this.fetchValue = options.fetchValue ?? fetch
    this.market = new DshfindAppMarket({
      fetchValue: this.fetchValue,
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    })
  }

  async list(
    queryValue: string,
    cursorValue: string | undefined,
    inventory: AppMarketInventory,
    signal?: AbortSignal,
  ): Promise<AppMarketPage> {
    const discoveryQuery = queryValue.trim().length === 0 ? DEFAULT_DISCOVERY_QUERY : queryValue
    const page = await this.market.list(discoveryQuery, cursorValue, inventory, signal)
    const candidates = page.items.filter(item => {
      const fullName = repositoryName(item.repository.url)
      return fullName !== undefined && !HOST_REPOSITORIES.has(fullName.toLowerCase())
    })
    const identities = await Promise.all(candidates.map(async candidate => await this.manifest(candidate, signal)))
    const items = candidates.flatMap((candidate, index) => {
      const identity = identities[index]
      if (identity === undefined) return []
      const item = Object.freeze({
        ...candidate,
        displayName: identity.title,
        packageName: identity.packageName,
        ...(identity.version === undefined ? {} : { latestVersion: identity.version }),
        installed: candidate.installed || inventory.packageNames.has(identity.packageName),
      } satisfies AppMarketItem)
      this.items.delete(item.id)
      this.items.set(item.id, item)
      while (this.items.size > MAX_CACHE_ITEMS) this.items.delete(this.items.keys().next().value as string)
      return [item]
    })
    const verifiedTotal = cursorValue === undefined && page.nextCursor === undefined ? items.length : undefined
    return Object.freeze({
      items: Object.freeze(items),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      ...(verifiedTotal === undefined ? {} : { total: verifiedTotal }),
    })
  }

  resolve(itemId: string): AppMarketItem {
    if (!IDENTIFIER_PATTERN.test(itemId) || itemId.length > 160) throw new Error('App market item id is invalid')
    const item = this.items.get(itemId)
    if (item === undefined) throw new Error('dshfind App is no longer available')
    return item
  }

  private async manifest(item: AppMarketItem, signal?: AbortSignal): Promise<AppManifestIdentity | undefined> {
    const cacheKey = `${item.repository.url}#${item.repository.subdirectory ?? ''}`
    const cached = this.manifests.get(cacheKey)
    if (cached !== undefined || this.manifests.has(cacheKey)) return cached ?? undefined
    const url = rawManifestUrl(item)
    if (url === undefined) return undefined
    const response = await this.fetchValue(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'application/json, text/plain;q=0.9',
        'accept-encoding': 'identity',
        'user-agent': 'deepdeck-app-store/1.0',
      },
      ...(signal === undefined ? {} : { signal }),
    })
    if (response.status === 404) {
      this.manifests.set(cacheKey, null)
      return undefined
    }
    if (response.status >= 300 && response.status < 400) throw new Error('DeepDeck App manifest redirected outside the reviewed request')
    if (!response.ok) throw new Error(`DeepDeck App manifest request failed with HTTP ${String(response.status)}`)
    if (response.url.length > 0 && new URL(response.url).origin !== RAW_GITHUB_ORIGIN) {
      throw new Error('DeepDeck App manifest response changed origin')
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^(?:application\/(?:json|[^;]+\+json)|text\/plain)(?:;|$)/iu.test(contentType)) {
      throw new Error('DeepDeck App manifest response is not JSON text')
    }
    const identity = parseManifest(JSON.parse(await boundedText(response)) as unknown)
    this.manifests.set(cacheKey, identity ?? null)
    return identity
  }
}
