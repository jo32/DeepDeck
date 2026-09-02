import { describe, expect, it, vi } from 'vitest'
import { installAppActionTools } from './action-tools.js'
import type { AppConversationActionToolDefinition } from './contracts.js'

const replyTool: AppConversationActionToolDefinition = {
  name: 'reader_set_reply_draft',
  description: 'Set the generated reply draft in the Reader window.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { content: { type: 'string' } },
    required: ['content'],
  },
  effect: 'reply-draft.set',
}

describe('App action tools', () => {
  it('binds a declared tool to one Agent action and records structured effects', async () => {
    const definitions: Array<{ execute(args: unknown, exec: unknown): Promise<string> }> = []
    const toolDispose = vi.fn()
    const events: Array<{ readonly type: string; readonly data: unknown }> = []
    const agent = {
      id: 'session-1',
      session: {
        id: 'session-1',
        header: { cwd: '/apps/reader' },
        events,
        append: vi.fn((type: string, data: unknown) => { events.push({ type, data }) }),
      },
      ctx: {
        tools: {
          register: vi.fn((definition: typeof definitions[number]) => {
            definitions.push(definition)
            return toolDispose
          }),
        },
      },
    }
    let disposed: ((payload: { readonly agent: typeof agent }) => void) | undefined
    const registry = {
      actionTools: vi.fn(() => [replyTool]),
    }
    const runtime = installAppActionTools({
      agents: { get: vi.fn(() => agent) },
      sessions: { flush: vi.fn(async () => true) },
      on: vi.fn((event: string, listener: typeof disposed) => {
        if (event === 'agent/disposed') disposed = listener as typeof disposed
        return () => {
          if (event === 'agent/disposed') disposed = undefined
        }
      }),
    } as never, registry)

    const execution = await runtime.begin({
      sessionId: 'session-1',
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    })
    expect(registry.actionTools).toHaveBeenCalledWith(
      'reader',
      '/apps/reader',
      ['reader_set_reply_draft'],
    )
    expect(agent.session.append).toHaveBeenCalledWith('deepdeck/app-action-binding', {
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    })
    expect(execution.tools).toEqual(['reader_set_reply_draft'])
    expect(definitions).toHaveLength(1)

    await expect(definitions[0]?.execute(
      { content: 'A reviewed draft' },
      { agent, signal: new AbortController().signal },
    )).resolves.toContain('"delivered":true')
    expect(runtime.read(execution.executionId, 0).effects).toEqual([
      expect.objectContaining({
        sequence: 1,
        toolName: 'reader_set_reply_draft',
        effect: 'reply-draft.set',
        payload: { content: 'A reviewed draft' },
      }),
    ])
    expect(runtime.read(execution.executionId, 1).effects).toEqual([])

    await expect(definitions[0]?.execute(
      { content: 'A direct follow-up draft' },
      { agent, signal: new AbortController().signal },
    )).resolves.toContain('"delivered":true')
    expect(toolDispose).not.toHaveBeenCalled()
    expect(runtime.read(execution.executionId, 1).effects).toEqual([
      expect.objectContaining({
        sequence: 2,
        payload: { content: 'A direct follow-up draft' },
      }),
    ])
    expect(runtime.read(execution.executionId, 0).effects).toHaveLength(1)
    expect(runtime.read(execution.executionId, 2).effects).toEqual([])
    runtime.finish(execution.executionId)
    expect(toolDispose).toHaveBeenCalledOnce()
    expect(() => runtime.read(execution.executionId, 0)).toThrow('Unknown or completed')
    runtime.dispose()
  })

  it('reuses the same Session binding, rejects a different App, and removes tools with the Agent', async () => {
    const toolDispose = vi.fn()
    const events: Array<{ readonly type: string; readonly data: unknown }> = []
    const agent = {
      id: 'session-1',
      session: {
        id: 'session-1',
        header: { cwd: '/apps/reader' },
        events,
        append: (type: string, data: unknown) => { events.push({ type, data }) },
      },
      ctx: { tools: { register: vi.fn(() => toolDispose) } },
    }
    let disposed: ((payload: { readonly agent: typeof agent }) => void) | undefined
    const runtime = installAppActionTools({
      agents: { get: () => agent },
      sessions: { flush: async () => true },
      on: (event: string, listener: typeof disposed) => {
        if (event === 'agent/disposed') disposed = listener as typeof disposed
        return () => {
          if (event === 'agent/disposed') disposed = undefined
        }
      },
    } as never, { actionTools: () => [replyTool] })
    const request = {
      sessionId: 'session-1',
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    }
    const execution = await runtime.begin(request)
    await expect(runtime.begin(request)).resolves.toEqual(execution)
    await expect(runtime.begin({ ...request, appId: 'writer' })).rejects.toThrow('different App action tools')
    disposed?.({ agent })
    expect(toolDispose).toHaveBeenCalledOnce()
    expect(() => runtime.read(execution.executionId, 0)).toThrow('Unknown or completed')
    runtime.dispose()
  })

  it('restores a durably bound App tool before a restarted Agent builds its next request', async () => {
    const events: Array<{ readonly type: string; readonly data: unknown }> = []
    const lifecycle = new Map<string, (payload: { readonly agent: ReturnType<typeof createAgent> }) => void>()
    const flush = vi.fn(async () => true)
    const createAgent = (register: ReturnType<typeof vi.fn>) => ({
      id: 'session-1',
      session: {
        id: 'session-1',
        header: { cwd: '/apps/reader' },
        events,
        append: (type: string, data: unknown) => { events.push({ type, data }) },
      },
      ctx: { tools: { register } },
    })
    const firstRegister = vi.fn(() => vi.fn())
    const firstAgent = createAgent(firstRegister)
    const context = (agent: typeof firstAgent) => ({
      agents: { get: () => agent },
      sessions: { flush },
      on: (event: string, listener: (payload: { readonly agent: typeof firstAgent }) => void) => {
        lifecycle.set(event, listener)
        return () => { lifecycle.delete(event) }
      },
    })
    const registry = { actionTools: vi.fn(() => [replyTool]) }
    const first = installAppActionTools(context(firstAgent) as never, registry)

    await first.begin({
      sessionId: 'session-1',
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    })
    expect(flush).toHaveBeenCalledOnce()
    expect(events).toEqual([{
      type: 'deepdeck/app-action-binding',
      data: { appId: 'reader', toolNames: ['reader_set_reply_draft'] },
    }])
    first.dispose()

    const secondRegister = vi.fn(() => vi.fn())
    const secondAgent = createAgent(secondRegister)
    const second = installAppActionTools(context(secondAgent) as never, registry)
    lifecycle.get('agent/created')?.({ agent: secondAgent })

    expect(secondRegister).toHaveBeenCalledOnce()
    expect(secondRegister.mock.calls[0]?.[0]).toMatchObject({ name: 'reader_set_reply_draft' })
    expect(events).toHaveLength(1)
    second.dispose()
  })

  it('migrates a legacy request/header binding so existing Sessions recover too', async () => {
    const events: Array<{ readonly type: string; readonly data: unknown }> = [{
      type: 'request/header',
      data: { header: { tools: [{ name: 'bash' }, { name: 'reader_set_reply_draft' }] } },
    }]
    const append = vi.fn((type: string, data: unknown) => { events.push({ type, data }) })
    const register = vi.fn(() => vi.fn())
    const flush = vi.fn(async () => true)
    const agent = {
      id: 'session-legacy',
      session: {
        id: 'session-legacy',
        header: { cwd: '/apps/reader' },
        events,
        append,
      },
      ctx: { tools: { register } },
    }
    let created: ((payload: { readonly agent: typeof agent }) => void) | undefined
    const runtime = installAppActionTools({
      agents: { get: () => agent },
      sessions: { flush },
      on: (event: string, listener: typeof created) => {
        if (event === 'agent/created') created = listener
        return () => { if (event === 'agent/created') created = undefined }
      },
    } as never, {
      actionTools: () => [replyTool],
      legacyActionToolBinding: (_cwd, names) => names.includes('reader_set_reply_draft')
        ? { appId: 'reader', toolNames: ['reader_set_reply_draft'] }
        : undefined,
    })

    created?.({ agent })
    await Promise.resolve()

    expect(register).toHaveBeenCalledOnce()
    expect(append).toHaveBeenCalledWith('deepdeck/app-action-binding', {
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    })
    expect(flush).toHaveBeenCalledOnce()
    runtime.dispose()
  })
})
