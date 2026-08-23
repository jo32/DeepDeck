import { hackerNewsHtmlToText } from './hn-api.js'

const HACKER_NEWS_ORIGIN = 'https://news.ycombinator.com'
const LOGIN_URL = `${HACKER_NEWS_ORIGIN}/login`
const NEWS_URL = `${HACKER_NEWS_ORIGIN}/news`
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface HackerNewsSession {
  readonly username: string
  readonly cookie: string
}

export interface HackerNewsSessionStatus {
  readonly valid: boolean
  readonly username: string
  readonly logoutUrl?: string
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

async function readText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error('Hacker News response exceeded the size limit')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Hacker News response exceeded the size limit')
  return new TextDecoder().decode(bytes)
}

function headerCookies(headers: Headers): readonly string[] {
  const candidate = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof candidate.getSetCookie === 'function') return candidate.getSetCookie()
  const value = headers.get('set-cookie')
  return value === null ? [] : [value]
}

export function extractHackerNewsSessionCookie(headers: Headers): string | undefined {
  for (const header of headerCookies(headers)) {
    const match = header.match(/(?:^|,\s*)user=([^;,\s]+)/u)
    if (match?.[1]) return match[1]
  }
  return undefined
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu'))
  return match?.[2]
}

function anchorWithId(html: string, id: string): string | undefined {
  return html.match(new RegExp(`<a\\b[^>]*\\bid\\s*=\\s*(["'])${id}\\1[^>]*>`, 'iu'))?.[0]
}

export function parseHackerNewsSessionPage(html: string): HackerNewsSessionStatus {
  const meTag = anchorWithId(html, 'me')
  if (meTag === undefined) return { valid: false, username: '' }
  const start = html.indexOf(meTag) + meTag.length
  const end = html.indexOf('</a>', start)
  const username = end < start ? '' : hackerNewsHtmlToText(html.slice(start, end))
  if (!username) return { valid: false, username: '' }

  const logoutTag = anchorWithId(html, 'logout')
  const rawLogout = logoutTag === undefined ? undefined : attribute(logoutTag, 'href')
  let logoutUrl: string | undefined
  if (rawLogout !== undefined) {
    try {
      const decoded = rawLogout.replaceAll('&amp;', '&')
      const url = new URL(decoded, HACKER_NEWS_ORIGIN)
      if (url.origin === HACKER_NEWS_ORIGIN && url.pathname === '/logout') logoutUrl = url.href
    } catch {
      logoutUrl = undefined
    }
  }
  return { valid: true, username, ...(logoutUrl === undefined ? {} : { logoutUrl }) }
}

export class HackerNewsAuthClient {
  constructor(private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)) {}

  async login(usernameValue: unknown, passwordValue: unknown): Promise<HackerNewsSession> {
    const username = String(usernameValue ?? '').trim()
    const password = String(passwordValue ?? '')
    if (!username || username.length > 64 || /[\u0000-\u001f\u007f]/u.test(username)) {
      throw new Error('enter a valid Hacker News username')
    }
    if (!password || password.length > 1_024) throw new Error('enter your Hacker News password')

    const body = new URLSearchParams({ acct: username, pw: password, goto: 'news' })
    const response = await this.fetchImpl(LOGIN_URL, {
      method: 'POST',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'content-type': 'application/x-www-form-urlencoded',
        origin: HACKER_NEWS_ORIGIN,
        referer: `${LOGIN_URL}?goto=news`,
        'user-agent': 'DeepDeck Hacker News Reader/0.1',
      },
      body,
      redirect: 'manual',
      signal: timeoutSignal(),
    })
    const cookie = extractHackerNewsSessionCookie(response.headers)
    if (cookie === undefined) {
      const message = hackerNewsHtmlToText(await readText(response))
      if (/bad login/iu.test(message)) throw new Error('incorrect Hacker News username or password')
      if (response.status === 429) throw new Error('Hacker News rate-limited the login; try again later')
      throw new Error(`Hacker News did not create a session (${response.status})`)
    }

    const status = await this.status(cookie)
    if (!status.valid) throw new Error('Hacker News created a session that could not be verified')
    return { username: status.username, cookie }
  }

  async status(cookieValue: unknown): Promise<HackerNewsSessionStatus> {
    const cookie = String(cookieValue ?? '').trim()
    if (!cookie || cookie.length > 8_192 || /[\r\n;]/u.test(cookie)) return { valid: false, username: '' }
    const response = await this.fetchImpl(NEWS_URL, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        cookie: `user=${cookie}`,
        'user-agent': 'DeepDeck Hacker News Reader/0.1',
      },
      redirect: 'follow',
      signal: timeoutSignal(),
    })
    if (!response.ok) throw new Error(`Hacker News session check failed (${response.status})`)
    return parseHackerNewsSessionPage(await readText(response))
  }

  async logout(cookieValue: unknown): Promise<boolean> {
    const cookie = String(cookieValue ?? '').trim()
    if (!cookie || cookie.length > 8_192 || /[\r\n;]/u.test(cookie)) return false
    const status = await this.status(cookie)
    if (!status.valid) return true
    if (status.logoutUrl === undefined) return false
    const response = await this.fetchImpl(status.logoutUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        cookie: `user=${cookie}`,
        referer: NEWS_URL,
        'user-agent': 'DeepDeck Hacker News Reader/0.1',
      },
      redirect: 'manual',
      signal: timeoutSignal(),
    })
    return response.status >= 200 && response.status < 400
  }
}
