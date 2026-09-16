import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { BrowserRuntime } from './runtime.js'
import { validateBenchmarkCatalog, acknowledgeBenchmarkUi, runBenchmarkAttempt, startBenchmarkController, validateBenchmarkRequest, summarizeBenchmarkEvents, type BenchmarkContext } from './benchmark.js'

const request = { url: 'http://localhost:3215/about', shellUrl: 'http://127.0.0.1:9999', prompt: 'Read the author', maxSteps: 12, timeoutMs: 600_000 }
describe('benchmark boundaries', () => {
  it('permits remote websites but keeps the controller shell local and attempts bounded', () => {
    expect(() => validateBenchmarkRequest(request)).not.toThrow()
    expect(() => validateBenchmarkRequest({ ...request, url: 'https://example.com' })).not.toThrow()
    for (const patch of [{ url: 'file:///tmp/private' }, { url: 'https://user:secret@example.com' }, { allowMissingTools: true }, { webmcpSource: 'test', webmcp: 'off' as const }, { shellUrl: 'http://evil.test' }, { maxSteps: 0 }, { timeoutMs: 600_001 }, { provider: 'test' }, { prompt: '' }, { today: 'not-a-date' }]) {
      expect(() => validateBenchmarkRequest({ ...request, ...patch })).toThrow()
    }
  })
  it('keeps missing accounting unknown, and extracts only assistant text', () => {
    expect(summarizeBenchmarkEvents([]).usage).toBeNull()
    const events = [
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Final answer: Azimuth' }] }, usage: { inputTokens: 12, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2 } } },
      { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    ] as unknown as SessionEvent[]
    const result = summarizeBenchmarkEvents(events)
    expect(result.finalText).toBe('Final answer: Azimuth')
    expect(result.usage).toEqual({ input_tokens: 12, output_tokens: 4, cached_input_tokens: 3, cache_creation_tokens: 2 })
    expect(result.usageComplete).toBe(true)
    expect(result.stopReason).toEqual({ kind: 'completed' })
  })
  it('preserves normal tools and presentation while enforcing the step budget, even without WebMCP', async () => {
    const hooks = new Map<string, (...args: any[]) => Promise<unknown>>()
    let presentation = '', restricted = false, disposed = false
    const agent = { status: 'idle', session: { id: 'session' }, ctx: { inject: (_names: string[], setup: (scope: unknown) => () => void) => {
      const stop = setup({
        tools: { presentAs(mode: string) { presentation = mode; return () => {} }, restrict(filter: { allow: string[] }) { restricted = filter.allow.length === 0; return () => {} } },
        on(name: string, handler: (...args: any[]) => Promise<unknown>) { hooks.set(name, handler); return () => hooks.delete(name) },
      })
      return { await: async () => {}, dispose: async () => { disposed = true; stop() } }
    } } }
    const runtime = { ctx: { agents: { get: () => agent } }, native: { request: async (command: { shellUrl: string }) => { expect(command.shellUrl).toContain('deepdeck-surface=browser'); acknowledgeBenchmarkUi(runtime, { siteId: 'site', sessionId: 'session', tabId: 'tab' }) } }, snapshot: async () => ({ tabs: [{ id: 'tab', origin: 'http://localhost:3215', loading: false, tools: [] }] }), sites: { ensure: async () => ({ id: 'site', workspacePath: '/tmp/site' }), get: () => ({ sessionId: 'session', tabId: 'tab' }) }, bind: async () => {} } as unknown as BrowserRuntime
    const ctx = { sessionController: {
      create: async () => { throw new Error('Benchmark must use the visible session, not create a second one') }, cancel: async () => {}, selectModel: async () => {},
      prompt: async (input: { content: { text: string }[] }, signal: AbortSignal) => {
        expect(signal).toBeInstanceOf(AbortSignal)
        expect(hooks.has('tools/pre-execute')).toBe(false)
        expect(input.content[0].text).toContain('choosing from the available tools')
        expect(input.content[0].text).toContain("Today's date is 2026-01-01")
        expect(input.content[0].text).not.toContain('Operate exclusively')
        expect(await hooks.get('agent/pre-step')!({}, async () => ({ kind: 'enter' }))).toEqual({ kind: 'enter' })
        expect(await hooks.get('agent/pre-step')!({}, async () => ({ kind: 'enter' }))).toEqual({ kind: 'reject' })
        await hooks.get('session/event')!({ id: 'session' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
      },
    } }
    const result = await runBenchmarkAttempt(ctx as unknown as BenchmarkContext, runtime, { ...request, maxSteps: 1, today: '2026-01-01' }, new AbortController().signal)
    expect(result).toMatchObject({ budgetExhausted: true, failure: 'step budget exhausted' })
    expect(presentation).toBe(''); expect(restricted).toBe(false); expect(disposed).toBe(true)
  })
  it('does not run a model when the visible conversation never connects, and rejects a mismatched acknowledgement', async () => {
    const controller = new AbortController()
    let prompts = 0
    const runtime = {
      ctx: { agents: { get: () => ({}) } },
      sites: { ensure: async () => ({ id: 'site' }), get: () => ({ sessionId: 'session', tabId: 'tab' }) },
      native: { request: async () => {} },
      snapshot: async () => ({ tabs: [{ id: 'tab', origin: 'http://localhost:3215', tools: [{ name: 'ask_site' }] }] }),
    } as unknown as BrowserRuntime
    expect(() => acknowledgeBenchmarkUi(runtime, { siteId: 'site', sessionId: 'wrong-session', tabId: 'tab' })).toThrow(/does not match/)
    const ctx = { sessionController: { prompt: async () => { prompts++ } } } as unknown as BenchmarkContext
    const timer = setTimeout(() => controller.abort(new Error('UI still disconnected')), 20)
    try {
      await expect(runBenchmarkAttempt(ctx, runtime, request, controller.signal)).rejects.toThrow('UI still disconnected')
      expect(prompts).toBe(0)
    } finally { clearTimeout(timer) }
  })
  it('protects the opt-in controller from website requests and permits only one attempt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'benchmark-controller-test-'))
    const ready = join(directory, 'ready.json'), token = 'a'.repeat(64)
    const runtime = { ctx: { logger: { warn() {} }, agents: { get: () => ({}) } }, sites: { ensure: async () => ({ id: 'site' }), get: () => ({ sessionId: 'session', tabId: 'tab' }) }, native: { request: async () => { acknowledgeBenchmarkUi(runtime, { siteId: 'site', sessionId: 'session', tabId: 'tab' }); return {} } }, snapshot: async () => ({ tabs: [{ id: 'tab', url: request.url, origin: 'http://localhost:3215', loading: false, tools: [{ name: 'ask_site' }] }] }) } as unknown as BrowserRuntime
    const stop = startBenchmarkController({} as BenchmarkContext, runtime, ready, token)
    try {
      let url = ''
      for (let i = 0; i < 100 && !url; i++) {
        try { url = JSON.parse(await readFile(ready, 'utf8')).url } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
      }
      expect(url).not.toBe('')
      expect((await fetch(url + '/status')).status).toBe(403)
      const headers = { authorization: `Bearer ${token}` }
      expect((await fetch(url + '/status', { headers: { ...headers, origin: request.url } })).status).toBe(403)
      expect((await fetch(url + '/run', { method: 'POST', headers, body: JSON.stringify({ ...request, inspect: true }) })).status).toBe(202)
      expect((await fetch(url + '/run', { method: 'POST', headers, body: JSON.stringify({ ...request, inspect: true }) })).status).toBe(409)
      const status = await (await fetch(url + '/status', { headers })).json()
      expect(status.result.kind).toBe('discovery-only')
      expect(status.result.connection).toMatchObject({ sessionId: 'session', tabId: 'tab', visibleConversationReady: true })
      expect(status.result.tools[0].name).toBe('ask_site')
    } finally { stop(); await rm(directory, { recursive: true, force: true }) }
  })
})

describe('paired browser modes', () => {
  it('fails closed when off exposes tools or the native feature flag disagrees', async () => {
    for (const snapshot of [
      { webmcpEnabled: true, tabs: [] },
      { webmcpEnabled: false, tabs: [{ tools: [{ name: 'leaked' }] }] },
    ]) {
      const runtime = { native: { request: async () => {} }, snapshot: async () => snapshot } as unknown as BrowserRuntime
      await expect(runBenchmarkAttempt({} as BenchmarkContext, runtime, { ...request, webmcp: 'off' }, new AbortController().signal)).rejects.toThrow(/does not match|unexpectedly exposes/)
    }
  })
  it('accepts off-mode discovery only when tools are absent and the visible session is connected', async () => {
    const runtime = {
      native: { request: async () => { acknowledgeBenchmarkUi(runtime, { siteId: 'site', sessionId: 'session', tabId: 'tab' }) } },
      snapshot: async () => ({ webmcpEnabled: false, tabs: [{ id: 'tab', origin: 'http://localhost:3215', loading: false, tools: [] }] }),
      sites: { ensure: async () => ({ id: 'site' }), get: () => ({ sessionId: 'session', tabId: 'tab' }) },
      ctx: { agents: { get: () => ({}) } },
    } as unknown as BrowserRuntime
    const result = await runBenchmarkAttempt({} as BenchmarkContext, runtime, { ...request, webmcp: 'off', inspect: true }, new AbortController().signal)
    expect(result).toMatchObject({ kind: 'discovery-only', webmcp: 'off', tools: [], connection: { visibleConversationReady: true } })
  })
})

it('rejects broken tool contracts before recording a WebMCP baseline', () => {
  const valid = { name: 'read_page', description: 'Read a page', frameId: 'frame', inputSchema: { type: 'object' } } as any
  expect(() => validateBenchmarkCatalog([valid])).not.toThrow()
  expect(() => validateBenchmarkCatalog([valid, valid])).toThrow(/duplicate/)
  expect(() => validateBenchmarkCatalog([{ ...valid, inputSchema: {} }])).toThrow(/Invalid/)
})

it('follows a website redirect and installs a supplied script through native WebMCP before inspection', async () => {
  const commands: any[] = []
  const tool = { name: 'read_page', description: 'Read page', inputSchema: { type: 'object' }, frameId: 'frame' }
  let installed = false
  const runtime = {
    native: { request: async (command: any) => {
      commands.push(command)
      if (command.action === 'open') acknowledgeBenchmarkUi(runtime, { siteId: 'site', sessionId: 'session', tabId: 'tab' })
      if (command.action === 'webmcp.install') installed = true
    } },
    snapshot: async () => ({ activeTabId: 'tab', webmcpEnabled: true, tabs: [{ id: 'tab', url: 'https://www.example.com/about', origin: 'https://www.example.com', loading: false, tools: installed ? [tool] : [] }] }),
    sites: { ensure: async (origin: string) => { expect(origin).toBe('https://www.example.com'); return { id: 'site' } }, get: () => ({ sessionId: 'session', tabId: 'tab' }) },
    ctx: { agents: { get: () => ({}) } },
  } as unknown as BrowserRuntime
  const result = await runBenchmarkAttempt({} as BenchmarkContext, runtime, { ...request, url: 'https://example.com/about', webmcp: 'on', inspect: true, webmcpSource: '/* registered source */' }, new AbortController().signal)
  expect(commands[1]).toMatchObject({ action: 'webmcp.install', script: { origin: 'https://www.example.com', source: '/* registered source */' } })
  expect(result).toMatchObject({ url: 'https://www.example.com/about', tools: [tool] })
})
