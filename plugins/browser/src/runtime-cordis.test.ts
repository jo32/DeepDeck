import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { Context } from '../../../vendor/deepseek-harness/vendor/cordis/lib/index.js'
import { createScope, type Scope } from '../../../vendor/deepseek-harness/packages/core/scope/lib/index.js'
import SystemPrompt from '../../../vendor/deepseek-harness/packages/core/system-prompt/lib/index.js'
import ToolRuntime from '../../../vendor/deepseek-harness/packages/core/tools/lib/index.js'
import { ToolCallId } from '../../../vendor/deepseek-harness/packages/llm/llm/lib/index.js'
import { agentEvents } from '../../../vendor/deepseek-harness/packages/core/agent/lib/index.js'
import type { Agent } from '../../../vendor/deepseek-harness/packages/core/agent/lib/index.js'
import { BrowserRuntime, type BrowserAgent, type BrowserHostContext } from './runtime.js'
import { BrowserSiteStore } from './site-store.js'
import { BrowserNativeClient } from './native-client.js'
import { WebMCPStore } from './webmcp-store.js'
import type { BrowserNativeCommand, BrowserSnapshot } from './native-contract.js'

it('assembles and executes direct page tools through real scoped Cordis services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'direct-webmcp-cordis-'))
  const ctx = new Context()
  let runtime: BrowserRuntime | undefined
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const sites = new BrowserSiteStore(root)
    const site = await sites.ensure('https://example.com')
    const schema = { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'], additionalProperties: false }
    const snapshot: BrowserSnapshot = { open: true, downloads: [], tabs: [{
      id: 'tab', documentId: 'doc-1', origin: site.origin, url: site.origin, title: 'Orders', loading: false,
      canGoBack: false, canGoForward: false,
      tools: [{ name: 'query_order', description: 'Query an order', inputSchema: schema, frameId: 'frame', documentId: 'doc-1', origin: site.origin, source: 'site' }],
    }] }
    const dispatch = vi.fn(async (command: BrowserNativeCommand) => {
      if (command.action === 'snapshot') return snapshot
      if (command.action === 'webmcp.call') return { orderId: command.input.orderId, status: 'confirmed' }
      throw new Error(`Unexpected command: ${command.action}`)
    })
    let running = false
    let scope: Scope
    const agent: BrowserAgent = {
      get status() { return running ? 'running' as const : 'idle' as const }, session: { id: 'session', header: { cwd: site.workspacePath }, append() {} },
      ctx: { inject(_names, apply) {
        const dispose = apply({
          tools: scope.ctx.tools as never, systemPrompt: scope.ctx.systemPrompt,
          skills: { register: () => () => {} },
        })
        return { await: async () => {}, dispose: async () => dispose() }
      } },
    }
    await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, { inject: ['tools', 'systemPrompt'] }))
    const native = { request: dispatch, available: true, dispose() {} } as unknown as BrowserNativeClient
    runtime = new BrowserRuntime({
      agents: { get: id => id === agent.session.id ? agent : undefined, list: () => [] },
      workspaceRegistry: { create: async path => ({ id: 'workspace', path, title: 'site' }) },
      logger: { warn: vi.fn() }, attachments: { saveImages: async () => [] },
      systemPrompt: ctx.systemPrompt,
      on: ((event: string, listener: never) => ctx.on(event as never, listener)) as BrowserHostContext['on'],
    }, native, sites, new WebMCPStore(join(root, 'webmcp')))
    await runtime.bind(site.id, agent.session.id, 'tab', 'use')
    running = true
    const signal = new AbortController().signal
    const assemble = async () => {
      const result = await ctx.systemPrompt.assemble({ scope: agent, agent: agent as unknown as Agent, signal })
      await agentEvents(ctx, agent as unknown as Agent).waterfall('agent/pre-step', { turn: 1, step: 1, messages: [], signal }, async () => ({ kind: 'enter', messages: [] }))
      return result
    }
    const first = await assemble()
    const direct = first.tools.find(tool => tool.name.startsWith('webmcp__query_order__'))!
    expect(direct.parameters).toEqual(schema)
    expect(first.tools.some(tool => tool.name === 'browser_webmcp_call')).toBe(false)
    // A different session/global scope never sees these registrations.
    expect((await ctx.systemPrompt.assemble()).tools).toEqual([])
    expect((await ctx.systemPrompt.assemble({ scope: {} })).tools).toEqual([])
    const call = (name: string) => ctx.tools.execute({ name, arguments: { orderId: 'o_123' }, callId: ToolCallId('call'), agent: agent as unknown as Agent, signal: new AbortController().signal })
    const result = await call(direct.name)
    expect(result.isError).toBe(false)
    expect(JSON.stringify(result.content)).toContain('confirmed')
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'webmcp.call', tabId: 'tab', documentId: 'doc-1', frameId: 'frame', name: 'query_order', input: { orderId: 'o_123' } }), expect.any(AbortSignal))

    snapshot.tabs[0]!.documentId = 'doc-2'
    snapshot.tabs[0]!.tools[0]!.documentId = 'doc-2'
    dispatch.mockClear()
    const stale = await call(direct.name)
    expect(stale.isError).toBe(true)
    expect(JSON.stringify(stale.content)).toContain('not_dispatched')
    expect(dispatch.mock.calls.every(([command]) => command.action !== 'webmcp.call')).toBe(true)
    await ctx.tools.execute({ name: 'browser_context', arguments: {}, callId: ToolCallId('observe'), agent: agent as unknown as Agent, signal })
    expect((await call(direct.name)).isError).toBe(true)
    const second = await assemble()
    expect(second.tools).toEqual(first.tools)
    const replacement = second.tools.find(tool => tool.name.startsWith('webmcp__query_order__'))!
    expect(replacement.parameters).toEqual(schema)
    expect(replacement.name).toBe(direct.name)
    expect((await call(replacement.name)).isError).toBe(false)
    runtime.dispose()
    expect((await assemble()).tools).toEqual([])
  } finally {
    runtime?.dispose()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
