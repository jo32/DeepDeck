import { describe, expect, it } from 'vitest'
import {
  extractHackerNewsSessionCookie,
  HackerNewsAuthClient,
  parseHackerNewsSessionPage,
} from '../src/hn-auth.js'

const sessionPage = `<html><body><a href='user?id=alice' id='me'>alice</a> | <a id='logout' href='logout?auth=secret&amp;goto=news'>logout</a></body></html>`

describe('Hacker News authentication', () => {
  it('extracts only the HN user session cookie', () => {
    const headers = new Headers({
      'set-cookie': 'theme=dark; Path=/, user=alice%26token; Path=/; Secure; HttpOnly',
    })

    expect(extractHackerNewsSessionCookie(headers)).toBe('alice%26token')
  })

  it('parses the signed-in username and constrained logout URL', () => {
    expect(parseHackerNewsSessionPage(sessionPage)).toEqual({
      valid: true,
      username: 'alice',
      logoutUrl: 'https://news.ycombinator.com/logout?auth=secret&goto=news',
    })
    expect(parseHackerNewsSessionPage('<html>guest</html>')).toEqual({ valid: false, username: '' })
  })

  it('exchanges a password for a verified cookie without retaining the password', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const client = new HackerNewsAuthClient(async (input, init) => {
      requests.push({ url: String(input), init })
      if (String(input).endsWith('/login')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'news', 'set-cookie': 'user=alice%26token; Path=/; Secure; HttpOnly' },
        })
      }
      return new Response(sessionPage, { status: 200 })
    })

    await expect(client.login('alice', 'one-time-password')).resolves.toEqual({
      username: 'alice',
      cookie: 'alice%26token',
    })
    expect(requests[0]?.init?.redirect).toBe('manual')
    expect(String(requests[0]?.init?.body)).toBe('acct=alice&pw=one-time-password&goto=news')
    expect(requests[1]?.init?.headers).toMatchObject({ cookie: 'user=alice%26token' })
  })

  it('reports an incorrect password without creating a session', async () => {
    const client = new HackerNewsAuthClient(async () => new Response('<html>Bad login.</html>', { status: 200 }))

    await expect(client.login('alice', 'incorrect')).rejects.toThrow('incorrect Hacker News username or password')
  })

  it('uses the server-provided logout action for a valid session', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const client = new HackerNewsAuthClient(async (input, init) => {
      requests.push({ url: String(input), init })
      if (String(input).includes('/logout?')) return new Response(null, { status: 302 })
      return new Response(sessionPage, { status: 200 })
    })

    await expect(client.logout('alice%26token')).resolves.toBe(true)
    expect(requests.at(-1)?.url).toBe('https://news.ycombinator.com/logout?auth=secret&goto=news')
    expect(requests.at(-1)?.init?.headers).toMatchObject({ cookie: 'user=alice%26token' })
  })
})
