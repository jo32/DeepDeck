import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { addressTarget, browserRequest, createBrowserClient } from './browser-api.js'

afterEach(() => vi.unstubAllGlobals())

describe('Browser address entry', () => {
  it('opens a URL or local development site and searches a phrase', () => {
    expect(addressTarget('example.com/docs')).toBe('https://example.com/docs')
    expect(addressTarget('localhost:3000/tools')).toBe('http://localhost:3000/tools')
    expect(addressTarget('https://example.com/?q=two%20words')).toBe('https://example.com/?q=two%20words')
    expect(addressTarget('webmcp tool discovery')).toBe('https://www.google.com/search?q=webmcp%20tool%20discovery')
    expect(addressTarget('')).toBe('about:blank')
    expect(addressTarget('127.0.0.1:8080?debug=1')).toBe('http://127.0.0.1:8080/?debug=1')
    expect(addressTarget('[::1]:3000/#test')).toBe('http://[::1]:3000/#test')
    expect(addressTarget('example.com?q=hello')).toBe('https://example.com/?q=hello')
    expect(addressTarget('example.com:8443/#hello')).toBe('https://example.com:8443/#hello')
    expect(addressTarget('docs.localhost:5173')).toBe('http://docs.localhost:5173/')
    expect(addressTarget('例子.测试/文档')).toBe(new URL('https://例子.测试/文档').href)
  })
  it('rejects execution and privileged schemes from the address bar', () => {
    for (const address of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,test']) {
      expect(() => addressTarget(address)).toThrow('Only HTTP and HTTPS')
    }
  })
})

describe('Browser session coordination', () => {
  const site = { id: 'site-a', origin: 'https://example.com', workspacePath: '/site-a', workspaceId: 'wa', title: 'Example', sessionId: 'session-a', mode: 'use', boundTabId: 'tab-a', revisions: [], enabled: true }
  function setup(running = false) {
    const requests: Record<string, unknown>[] = []
    const events: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const action = JSON.parse(init.body)
      requests.push(action)
      events.push(action.action)
      return { ok: true, json: async () => action.action === 'site.resolve' ? site : { site, binding: action } }
    }))
    const open = vi.fn(() => events.push('session.open'))
    const binding = { session: {} }
    const generation = {}
    const models = vi.fn(async () => {
      events.push('session.models')
      return { result: { ok: true, value: {} } }
    })
    const create = vi.fn()
    const ctx = {
      get: () => ({ api: { sessions: { create, models } }, hostDescription: { getSnapshot: () => generation } }),
      sessions: {
        list: { getSnapshot: () => ({ byId: { 'session-a': { cwd: '/site-a', running } } }) },
        open,
        binding: () => binding,
      },
    } as unknown as ClientContext
    return { client: createBrowserClient(ctx), requests, events, open, models, create }
  }
  it('binds an idle task to its selected page before showing the composer', async () => {
    const { client, requests, events } = setup()
    await expect(client.prepareAgent('tab-b', 'builder', true)).resolves.toEqual({ siteId: 'site-a', sessionId: 'session-a', tabId: 'tab-b' })
    expect(requests[1]).toMatchObject({ action: 'site.bind', sessionId: 'session-a', mode: 'builder', tabId: 'tab-b' })
    expect(events).toEqual(['site.resolve', 'session.models', 'site.bind', 'session.open'])
  })
  it('keeps a running task on its original tab and mode', async () => {
    const { client, requests } = setup(true)
    await expect(client.prepareAgent('tab-b', 'builder', false)).resolves.toEqual({ siteId: 'site-a', sessionId: 'session-a', tabId: 'tab-a' })
    expect(requests.map(value => value.action)).toEqual(['site.resolve'])
  })
  it('does not append another binding when restoring the same confirmed idle session', async () => {
    const { client, requests, models, create } = setup()
    await client.prepareAgent('tab-a', 'use', false)
    await client.prepareAgent('tab-a', 'use', false)
    expect(requests.filter(value => value.action === 'site.bind')).toHaveLength(1)
    expect(models).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
  })
  it('keeps the Composer closed when cold Session activation fails', async () => {
    const { client, requests, models, open, create } = setup()
    models.mockResolvedValueOnce({ result: { ok: false, error: { message: 'Cold Session could not resume.' } } } as never)
    await expect(client.prepareAgent('tab-a', 'use', false)).rejects.toThrow('Cold Session could not resume.')
    expect(requests.some(value => value.action === 'site.bind')).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
  it('does not overwrite an Agent mode change with a stale automatic-restore snapshot', async () => {
    const { client, requests } = setup()
    // The previous poll still showed Builder, but the Agent has already
    // switched to Use in the authoritative site.resolve response.
    await client.prepareAgent('tab-a', 'builder', false)
    expect(requests.find(value => value.action === 'site.bind')).toMatchObject({ mode: 'use' })
  })
  it('deduplicates automatic creation and saves the session when its first tab selection is cancelled', async () => {
    const state = { ...site, sessionId: undefined as string | undefined }
    const abort = new AbortController()
    const create = vi.fn(async () => {
      abort.abort()
      return { result: { ok: true, value: { sessionId: 'session-a' } } }
    })
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const action = JSON.parse(init.body)
      if (action.action === 'site.bind') Object.assign(state, { sessionId: action.sessionId, boundTabId: action.tabId, mode: action.mode })
      return { ok: true, json: async () => ({ ...state }) }
    }))
    const open = vi.fn()
    const binding = { session: { rename: vi.fn(async () => ({ ok: true })) } }
    const generation = {}
    const client = createBrowserClient({
      get: () => ({ api: { sessions: { create, models: async () => ({ result: { ok: true } }) } }, hostDescription: { getSnapshot: () => generation } }),
      workspaces: { list: { getSnapshot: () => ({ items: [{ path: '/site-a', workspaceId: 'wa' }] }) } },
      sessions: { list: { getSnapshot: () => ({ byId: { 'session-a': { cwd: '/site-a', running: false } } }) }, open, binding: () => binding },
    } as unknown as ClientContext)
    const results = await Promise.allSettled([
      client.prepareAgent('tab-a', 'use', 'auto', abort.signal),
      client.prepareAgent('tab-b', 'builder', 'auto'),
    ])
    expect(results[0].status).toBe('rejected')
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { sessionId: 'session-a', tabId: 'tab-b' } })
    expect(create).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledExactlyOnceWith('session-a')
    expect(state).toMatchObject({ sessionId: 'session-a', boundTabId: 'tab-b', mode: 'use' })
  })
  it('does not rebind or open a session after its selection is superseded', async () => {
    const { client, requests, open } = setup()
    const abort = new AbortController()
    abort.abort()
    await expect(client.prepareAgent('tab-b', 'use', false, abort.signal)).rejects.toThrow()
    expect(requests.map(value => value.action)).toEqual(['site.resolve'])
    expect(open).not.toHaveBeenCalled()
  })
  it('returns a native error without reporting command success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'The target page changed.' }) })))
    await expect(browserRequest({ action: 'state' })).rejects.toThrow('The target page changed.')
  })
})
