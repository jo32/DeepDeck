const FIREBASE_API = 'https://hacker-news.firebaseio.com/v0'
const SEARCH_API = 'https://hn.algolia.com/api/v1'
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000
const FEED_CACHE_MS = 60_000
const ITEM_CACHE_MS = 120_000

export const HACKER_NEWS_FEEDS = ['top', 'new', 'best', 'ask', 'show', 'jobs'] as const
export type HackerNewsFeed = typeof HACKER_NEWS_FEEDS[number]
export type HackerNewsSearchSort = 'relevance' | 'date'

export interface HackerNewsStorySummary {
  readonly id: number
  readonly title: string
  readonly by: string
  readonly time: number
  readonly score: number
  readonly commentCount: number
  readonly type: string
  readonly url?: string
  readonly domain?: string
  readonly text?: string
}

export interface HackerNewsComment {
  readonly id: number
  readonly parentId: number
  readonly by: string
  readonly time: number
  readonly text: string
  readonly depth: number
  readonly childCount: number
  readonly deleted: boolean
  readonly dead: boolean
}

export interface HackerNewsStory extends HackerNewsStorySummary {
  readonly comments: readonly HackerNewsComment[]
  readonly commentsTruncated: boolean
}

export interface HackerNewsFeedResult {
  readonly feed: HackerNewsFeed
  readonly page: number
  readonly pages: number
  readonly limit: number
  readonly total: number
  readonly stories: readonly HackerNewsStorySummary[]
}

export interface HackerNewsSearchResult {
  readonly query: string
  readonly sort: HackerNewsSearchSort
  readonly page: number
  readonly pages: number
  readonly total: number
  readonly stories: readonly HackerNewsStorySummary[]
}

export interface HackerNewsUser {
  readonly id: string
  readonly created: number
  readonly karma: number
  readonly about: string
  readonly submitted: readonly number[]
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>
type JsonObject = Record<string, unknown>

interface CacheEntry<T> {
  readonly value: T
  readonly expiresAt: number
}

const FEED_ENDPOINTS: Readonly<Record<HackerNewsFeed, string>> = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
  ask: 'askstories',
  show: 'showstories',
  jobs: 'jobstories',
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function decodeEntity(entity: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  if (entity in named) return named[entity] ?? ''
  const raw = entity.startsWith('#x') || entity.startsWith('#X')
    ? Number.parseInt(entity.slice(2), 16)
    : entity.startsWith('#')
      ? Number.parseInt(entity.slice(1), 10)
      : Number.NaN
  if (!Number.isSafeInteger(raw) || raw <= 0 || raw > 0x10ffff) return `&${entity};`
  return String.fromCodePoint(raw)
}

/** Convert HN's user-authored HTML into inert, readable plain text. */
export function hackerNewsHtmlToText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return ''
  return value
    .replace(/<\s*br\s*\/?>/giu, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|pre|blockquote)\s*>/giu, '\n\n')
    .replace(/<\s*(?:p|div|li|pre|blockquote)(?:\s[^>]*)?>/giu, '')
    .replace(/<[^>]*>/gu, '')
    .replace(/&([#a-z0-9]+);/giu, (_match, entity: string) => decodeEntity(entity.toLowerCase()))
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8_192) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function domainOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./u, '')
  } catch {
    return undefined
  }
}

function storyFromFirebase(value: unknown): HackerNewsStorySummary | undefined {
  if (!isObject(value) || value.deleted === true || value.dead === true) return undefined
  const id = finiteNumber(value.id)
  const title = hackerNewsHtmlToText(value.title)
  if (!Number.isSafeInteger(id) || id <= 0 || title.length === 0) return undefined
  const url = safeHttpUrl(value.url)
  const domain = domainOf(url)
  const story: HackerNewsStorySummary = {
    id,
    title,
    by: textValue(value.by, 'unknown'),
    time: finiteNumber(value.time),
    score: finiteNumber(value.score),
    commentCount: finiteNumber(value.descendants),
    type: textValue(value.type, 'story'),
    ...(url === undefined ? {} : { url }),
    ...(domain === undefined ? {} : { domain }),
  }
  const text = hackerNewsHtmlToText(value.text)
  return text.length === 0 ? story : { ...story, text }
}

function storyFromAlgolia(value: unknown): HackerNewsStorySummary | undefined {
  if (!isObject(value)) return undefined
  const id = finiteNumber(value.id ?? Number(value.objectID))
  const title = hackerNewsHtmlToText(value.title ?? value.story_title)
  if (!Number.isSafeInteger(id) || id <= 0 || title.length === 0) return undefined
  const url = safeHttpUrl(value.url ?? value.story_url)
  const domain = domainOf(url)
  const time = finiteNumber(value.created_at_i, Date.parse(textValue(value.created_at)) / 1_000)
  const story: HackerNewsStorySummary = {
    id,
    title,
    by: textValue(value.author, 'unknown'),
    time: Number.isFinite(time) ? time : 0,
    score: finiteNumber(value.points),
    commentCount: finiteNumber(value.num_comments, Array.isArray(value.children) ? value.children.length : 0),
    type: 'story',
    ...(url === undefined ? {} : { url }),
    ...(domain === undefined ? {} : { domain }),
  }
  const text = hackerNewsHtmlToText(value.text ?? value.story_text)
  return text.length === 0 ? story : { ...story, text }
}

function flattenComments(
  children: unknown,
  maximum: number,
): { comments: HackerNewsComment[]; truncated: boolean } {
  const comments: HackerNewsComment[] = []
  let sawMore = false

  const visit = (items: unknown, depth: number): void => {
    if (!Array.isArray(items)) return
    for (const value of items) {
      if (comments.length >= maximum) {
        sawMore = true
        return
      }
      if (!isObject(value)) continue
      const id = finiteNumber(value.id)
      if (!Number.isSafeInteger(id) || id <= 0) continue
      const nested = Array.isArray(value.children) ? value.children : []
      const deleted = value.deleted === true
      const dead = value.dead === true
      comments.push({
        id,
        parentId: finiteNumber(value.parent_id),
        by: deleted ? '[deleted]' : textValue(value.author, 'unknown'),
        time: finiteNumber(value.created_at_i, Date.parse(textValue(value.created_at)) / 1_000),
        text: deleted ? '[deleted]' : hackerNewsHtmlToText(value.text),
        depth: Math.min(depth, 12),
        childCount: nested.length,
        deleted,
        dead,
      })
      visit(nested, depth + 1)
      if (sawMore) return
    }
  }

  visit(children, 0)
  return { comments, truncated: sawMore }
}

async function readResponseJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Hacker News request failed (${response.status})`)
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error('Hacker News response exceeded the size limit')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Hacker News response exceeded the size limit')
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

async function mapConcurrent<T, TResult>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next
      next += 1
      const value = values[index]
      if (value !== undefined) results[index] = await mapper(value)
    }
  })
  await Promise.all(workers)
  return results
}

export class HackerNewsClient {
  private readonly feedCache = new Map<HackerNewsFeed, CacheEntry<readonly number[]>>()
  private readonly itemCache = new Map<number, CacheEntry<HackerNewsStorySummary | undefined>>()

  constructor(
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = Date.now,
  ) {}

  private async fetchJson(url: string | URL): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return await readResponseJson(response)
  }

  private async feedIds(feed: HackerNewsFeed): Promise<readonly number[]> {
    const cached = this.feedCache.get(feed)
    if (cached !== undefined && cached.expiresAt > this.now()) return cached.value
    const raw = await this.fetchJson(`${FIREBASE_API}/${FEED_ENDPOINTS[feed]}.json`)
    if (!Array.isArray(raw)) throw new Error('Hacker News feed returned an invalid response')
    const value = raw.filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, 500)
    this.feedCache.set(feed, { value, expiresAt: this.now() + FEED_CACHE_MS })
    return value
  }

  private async story(id: number): Promise<HackerNewsStorySummary | undefined> {
    const cached = this.itemCache.get(id)
    if (cached !== undefined && cached.expiresAt > this.now()) return cached.value
    const value = storyFromFirebase(await this.fetchJson(`${FIREBASE_API}/item/${id}.json`))
    if (this.itemCache.size >= 1_000) this.itemCache.clear()
    this.itemCache.set(id, { value, expiresAt: this.now() + ITEM_CACHE_MS })
    return value
  }

  async listStories(
    feedValue: unknown,
    pageValue: unknown = 1,
    limitValue: unknown = 30,
  ): Promise<HackerNewsFeedResult> {
    const feed = textValue(feedValue) as HackerNewsFeed
    if (!HACKER_NEWS_FEEDS.includes(feed)) throw new Error('unknown Hacker News feed')
    const page = boundedInteger(pageValue, 1, 1, 50)
    const limit = boundedInteger(limitValue, 30, 1, 50)
    const ids = await this.feedIds(feed)
    const pages = Math.max(1, Math.ceil(ids.length / limit))
    const selected = ids.slice((page - 1) * limit, page * limit)
    const stories = (await mapConcurrent(selected, 12, async id => await this.story(id)))
      .filter((value): value is HackerNewsStorySummary => value !== undefined)
    return { feed, page, pages, limit, total: ids.length, stories }
  }

  async searchStories(
    queryValue: unknown,
    pageValue: unknown = 1,
    sortValue: unknown = 'relevance',
    limitValue: unknown = 30,
  ): Promise<HackerNewsSearchResult> {
    const query = textValue(queryValue).trim()
    if (query.length === 0) throw new Error('search query is required')
    if (query.length > 240) throw new Error('search query is too long')
    const page = boundedInteger(pageValue, 1, 1, 100)
    const limit = boundedInteger(limitValue, 30, 1, 50)
    const sort: HackerNewsSearchSort = sortValue === 'date' ? 'date' : 'relevance'
    const endpoint = sort === 'date' ? 'search_by_date' : 'search'
    const url = new URL(`${SEARCH_API}/${endpoint}`)
    url.searchParams.set('query', query)
    url.searchParams.set('tags', 'story')
    url.searchParams.set('page', String(page - 1))
    url.searchParams.set('hitsPerPage', String(limit))
    const raw = await this.fetchJson(url)
    if (!isObject(raw) || !Array.isArray(raw.hits)) throw new Error('HN Search returned an invalid response')
    const stories = raw.hits.map(storyFromAlgolia)
      .filter((value): value is HackerNewsStorySummary => value !== undefined)
    return {
      query,
      sort,
      page: finiteNumber(raw.page, page - 1) + 1,
      pages: Math.max(1, finiteNumber(raw.nbPages, 1)),
      total: finiteNumber(raw.nbHits, stories.length),
      stories,
    }
  }

  async readStory(idValue: unknown, maxCommentsValue: unknown = 240): Promise<HackerNewsStory> {
    const id = positiveInteger(idValue, 'story id')
    const maxComments = boundedInteger(maxCommentsValue, 240, 1, 500)
    const raw = await this.fetchJson(`${SEARCH_API}/items/${id}`)
    const story = storyFromAlgolia(raw)
    if (story === undefined) throw new Error('Hacker News story was not found')
    const flattened = flattenComments(isObject(raw) ? raw.children : [], maxComments)
    return {
      ...story,
      commentCount: Math.max(story.commentCount, flattened.comments.length),
      comments: flattened.comments,
      commentsTruncated: flattened.truncated,
    }
  }

  async user(usernameValue: unknown): Promise<HackerNewsUser> {
    const username = textValue(usernameValue).trim()
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(username)) throw new Error('invalid Hacker News username')
    const raw = await this.fetchJson(`${FIREBASE_API}/user/${encodeURIComponent(username)}.json`)
    if (!isObject(raw) || typeof raw.id !== 'string') throw new Error('Hacker News user was not found')
    const submitted = Array.isArray(raw.submitted)
      ? raw.submitted.filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, 100)
      : []
    return {
      id: raw.id,
      created: finiteNumber(raw.created),
      karma: finiteNumber(raw.karma),
      about: hackerNewsHtmlToText(raw.about),
      submitted,
    }
  }
}
