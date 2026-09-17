/** Opt-in local benchmark controller. Never mounted in a normal desktop run. */
import { createServer } from 'node:http'
import { timingSafeEqual, randomUUID, createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRequestId, SessionCreateRequest, SessionCreateValue, SessionSelectModelRequest, SessionSelectModelValue, SessionPromptRequest, SessionPromptValue, SessionCancelRequest, SessionCancelValue } from '@deepseek-ai/dsh-api-session-controller/types'
import type { BrowserTool } from './native-contract.js'
import type { BrowserRuntime, BrowserAgent } from './runtime.js'

interface BenchmarkScope {
  on(event: 'session/event', handler: (session: { id: string }, event: SessionEvent) => void): () => void
}
interface BenchmarkAgent {
  status: string
  session: { id: string }
  ctx: { inject(names: readonly string[], apply: (scope: BenchmarkScope) => (() => void)): { await(): Promise<unknown>; dispose(): Promise<unknown> } }
}
export interface BenchmarkContext {
  // Use the leaf wire types: importing the Host service class here would merge
  // Host Cordis services into this package's Client compilation.
  sessionController: {
    create(request: SessionCreateRequest): Promise<SessionCreateValue>
    selectModel(request: SessionSelectModelRequest): Promise<SessionSelectModelValue>
    prompt(request: SessionPromptRequest, signal: AbortSignal): Promise<SessionPromptValue>
    cancel(request: SessionCancelRequest): SessionCancelValue
  }
}
export interface BenchmarkRequest {
  url: string
  shellUrl: string
  prompt: string
  inspect?: boolean
  allowMissingTools?: boolean
  webmcpSource?: string
  webmcp?: 'on' | 'off'
  today?: string
  provider?: string
  model?: string
  reasoningEffort?: string
  timeoutMs: number
}
const pause = () => new Promise(resolve => setTimeout(resolve, 100))

interface BenchmarkUiBinding { siteId: string; sessionId: string; tabId: string }
const readyViews = new WeakMap<BrowserRuntime, BenchmarkUiBinding>()

export function acknowledgeBenchmarkUi(runtime: BrowserRuntime, binding: BenchmarkUiBinding): void {
  const site = runtime.sites.get(binding.siteId)
  if (site.sessionId !== binding.sessionId || site.tabId !== binding.tabId || !runtime.ctx.agents.get(binding.sessionId)) throw new Error('Benchmark UI does not match the active site Agent.')
  readyViews.set(runtime, binding)
}

export function validateBenchmarkCatalog(tools: BrowserTool[]): void {
  const seen = new Set<string>()
  for (const tool of tools) {
    const key = `${tool.frameId}:${tool.name}`
    if (!/^[a-zA-Z0-9_-]+$/.test(tool.name) || !tool.description?.trim() || tool.inputSchema?.type !== 'object' || seen.has(key)) throw new Error(`Invalid or duplicate WebMCP tool contract: ${tool.name}`)
    seen.add(key)
  }
}

export function validateBenchmarkRequest(input: BenchmarkRequest): void {
  if (input.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.today)) throw new Error('Invalid benchmark date.')
  if (input.webmcp !== undefined && !['on', 'off'].includes(input.webmcp)) throw new Error('Invalid WebMCP arm.')
  const shell = new URL(input.shellUrl)
  if (shell.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(shell.hostname) || shell.username || shell.password) throw new Error('Benchmark shell must be a local HTTP URL.')
  const target = new URL(input.url)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Benchmark target must be an HTTP(S) URL without embedded credentials.')
  if (input.allowMissingTools && !input.inspect) throw new Error('Missing tools may only be allowed during inspection.')
  if (input.webmcpSource !== undefined && (input.webmcp !== 'on' || typeof input.webmcpSource !== 'string' || !input.webmcpSource.trim() || Buffer.byteLength(input.webmcpSource) > 256 * 1024)) throw new Error('WebMCP source requires the on arm and a nonempty script up to 256 KiB.')
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error('Missing task prompt.')
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 600_000) throw new Error('timeoutMs must be 1000–600000.')
  if (Boolean(input.provider) !== Boolean(input.model)) throw new Error('Set both provider and model, or neither.')
}

export function summarizeBenchmarkEvents(events: readonly SessionEvent[]) {
  const messages = events.filter(event => event.type === 'assistant/message')
  const last = messages.at(-1)
  const usage = messages.some(event => event.data.usage) ? {
    input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cache_creation_tokens: 0,
  } : null
  for (const event of messages) {
    if (!usage || !event.data.usage) continue
    usage.input_tokens += event.data.usage.inputTokens
    usage.output_tokens += event.data.usage.outputTokens
    usage.cached_input_tokens += event.data.usage.cacheReadTokens ?? 0
    usage.cache_creation_tokens += event.data.usage.cacheWriteTokens ?? 0
  }
  const end = events.findLast(event => event.type === 'turn/end')
  return {
    finalText: last?.data.message.content.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '',
    usage, usageComplete: messages.length > 0 && messages.every(event => event.data.usage),
    turns: events.filter(event => event.type === 'step/start').length,
    toolCalls: events.filter(event => event.type === 'tool/call').length,
    stopReason: end?.data.reason,
    // Preserve the actual route and raw usage instead of guessing provider cost.
    routes: events.filter(event => event.type === 'request/context').map(event => event.data),
    transcript: events,
  }
}

export async function runBenchmarkAttempt(ctx: BenchmarkContext, runtime: BrowserRuntime, input: BenchmarkRequest, signal: AbortSignal, progress: (phase: string) => void = () => {}) {
  const started = performance.now()
  const origin = new URL(input.url).origin
  readyViews.delete(runtime)
  progress('opening-browser')
  await runtime.native.request({ action: 'open', shellUrl: new URL('/?deepdeck-surface=browser', input.shellUrl).href, url: input.url }, signal)
  let tab
  let installed = false, loadedAt: number | undefined
  const readyDeadline = Date.now() + 90_000
  while (!tab) {
    signal.throwIfAborted()
    const snapshot = await runtime.snapshot()
    if (input.webmcp && snapshot.webmcpEnabled !== (input.webmcp === 'on')) throw new Error('Native browser WebMCP mode does not match the requested arm.')
    if (input.webmcp === 'off' && snapshot.tabs.some(value => value.tools.length)) throw new Error('Off arm unexpectedly exposes WebMCP tools.')
    // A fresh benchmark browser owns one target tab. Follow normal redirects,
    // while the Harness shell always remains loopback-only.
    const candidate = snapshot.tabs.find(value => value.id === snapshot.activeTabId && /^https?:/.test(value.url))
      ?? snapshot.tabs.find(value => value.origin === origin)
    if (candidate && !candidate.loading) {
      if (candidate.error) throw new Error(`Website failed to load: ${candidate.error}`)
      loadedAt ??= Date.now()
      if (input.webmcpSource && !installed) {
        await runtime.native.request({ action: 'webmcp.install', script: { origin: candidate.origin, revision: createHash('sha256').update(input.webmcpSource).digest('hex'), source: input.webmcpSource } }, signal)
        installed = true
        continue
      }
      const needsTools = input.webmcp === 'on' || (input.inspect && input.webmcp !== 'off')
      if (!needsTools || candidate.tools.length || (input.allowMissingTools && Date.now() - loadedAt >= 10_000)) tab = candidate
    }
    if (Date.now() > readyDeadline) throw new Error(`Website or native WebMCP tools did not become ready within 90 seconds: ${JSON.stringify(snapshot.tabs.map(({ url, loading, error, webmcpError }) => ({ url, loading, error, webmcpError })))}`)
    if (!tab) await pause()
  }
  progress('connecting-visible-session')
  const site = await runtime.sites.ensure(tab.origin)
  let view: BenchmarkUiBinding | undefined
  while (!view) {
    signal.throwIfAborted()
    const candidate = readyViews.get(runtime)
    if (candidate?.siteId === site.id && candidate.tabId === tab.id) view = candidate
    if (Date.now() > readyDeadline) throw new Error('Browser opened, but its visible Agent conversation did not connect within 90 seconds.')
    if (!view) await pause()
  }
  const sessionId = view.sessionId as SessionId
  const current = runtime.sites.get(site.id)
  if (current.sessionId !== sessionId || current.tabId !== tab.id) throw new Error('Visible benchmark session binding changed.')
  const agent = runtime.ctx.agents.get(sessionId) as BrowserAgent & BenchmarkAgent
  if (!agent) throw new Error('Benchmark session has no Agent.')
  if (input.webmcp === 'on') validateBenchmarkCatalog(tab.tools)
  const connection = { ...view, visibleConversationReady: true }
  if (input.inspect) return { kind: 'discovery-only', url: tab.url, tools: tab.tools, connection, webmcp: input.webmcp ?? 'unspecified', setupMs: performance.now() - started }
  progress('selecting-model')
  if (input.provider && input.model) await ctx.sessionController.selectModel({ sessionId, provider: input.provider, model: input.model, ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}) })
  let timedOut = false
  const events: SessionEvent[] = []
  progress('installing-run-limits')
  const scoped = (agent as BenchmarkAgent).ctx.inject([], scope => {
    const stops = [
      scope.on('session/event', (session, event) => { if (session.id === sessionId) events.push(event) }),
    ]
    return () => stops.reverse().forEach(stop => stop())
  })
  await scoped.await()
  const setupMs = performance.now() - started
  const cancel = () => { try { ctx.sessionController.cancel({ sessionId }) } catch {} }
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => { timedOut = true; cancel() }, input.timeoutMs)
  try {
    signal.throwIfAborted()
    progress('submitting-prompt')
    await ctx.sessionController.prompt({ sessionId, requestId: randomUUID() as SessionRequestId, mode: 'queue', content: [{ type: 'text', text: `You are completing a website benchmark. Use the website to complete the task, choosing from the available tools. Do not inspect benchmark source files, fixtures or evaluation data. End with a concise 'Final answer:'. Today's date is ${input.today ?? new Date().toISOString().slice(0, 10)}.\n\n${input.prompt}` }] }, signal)
    progress('running-agent')
    while (true) {
      if (agent.status === 'idle' && events.some(event => event.type === 'turn/end')) break
      if ((timedOut || signal.aborted) && agent.status === 'idle') break
      await pause()
    }
    const finalSnapshot = await runtime.snapshot()
    if (input.webmcp === 'off' && (finalSnapshot.webmcpEnabled !== false || finalSnapshot.tabs.some(value => value.tools.length))) throw new Error('Off arm was contaminated by WebMCP.')
    const result = summarizeBenchmarkEvents(events)
    return { ...result, url: tab.url, sessionId, connection, webmcp: input.webmcp ?? 'unspecified', initialTools: tab.tools, setupMs, agentMs: performance.now() - started - setupMs,
      timedOut, timeoutMs: input.timeoutMs, cost: null,
      failure: timedOut ? 'attempt timeout' : signal.aborted ? 'attempt cancelled' : result.stopReason?.kind !== 'completed' ? JSON.stringify(result.stopReason ?? 'no completed turn') : '',
    }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    await scoped.dispose()
  }
}

/** A random capability token and loopback binding keep this out of website reach. */
export function startBenchmarkController(ctx: BenchmarkContext, runtime: BrowserRuntime, readyFile: string, token: string): () => void {
  if (token.length < 32) throw new Error('Benchmark token must contain at least 32 characters.')
  let state: { status: string; phase?: string; result?: unknown; error?: string } = { status: 'ready' }
  const controller = new AbortController()
  const server = createServer(async (request, response) => {
    const reply = (code: number, value: unknown) => { response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)) }
    const supplied = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (request.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { reply(403, { error: 'Forbidden' }); return }
    if (request.method === 'GET' && request.url === '/status') { reply(200, state); return }
    if (request.method !== 'POST' || request.url !== '/run') { reply(404, { error: 'Not found' }); return }
    // Exactly one attempt per fresh desktop/profile; no retries of mutations.
    if (state.status !== 'ready') { reply(409, { error: 'This desktop already owns an attempt.' }); return }
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 512 * 1024) throw new Error('Request too large'); chunks.push(Buffer.from(chunk)) }
      const input = JSON.parse(Buffer.concat(chunks).toString()) as BenchmarkRequest
      validateBenchmarkRequest(input)
      if (state.status !== 'ready') { reply(409, { error: 'Attempt already started' }); return }
      state = { status: 'running' }
      void runBenchmarkAttempt(ctx, runtime, input, controller.signal, phase => { state = { status: 'running', phase } }).then(result => { state = { status: 'completed', result } }, error => { state = { status: 'failed', error: String(error) } })
      reply(202, { status: 'running' })
    } catch (error) { reply(400, { error: String(error) }) }
  })
  server.on('error', error => runtime.ctx.logger.warn(`Benchmark controller: ${error.message}`))
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address && typeof address !== 'string') void writeFile(readyFile, JSON.stringify({ url: `http://127.0.0.1:${address.port}` }), { mode: 0o600, flag: 'wx' }).catch(error => { runtime.ctx.logger.warn(String(error)); server.close() })
  })
  return () => { controller.abort(); server.closeAllConnections(); server.close() }
}
