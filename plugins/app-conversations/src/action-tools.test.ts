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
    const agent = {
      id: 'session-1',
      session: { id: 'session-1', header: { cwd: '/apps/reader' } },
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
    let sessionEvent: ((session: typeof agent.session, event: { readonly type: string }) => void) | undefined
    const registry = {
      actionTools: vi.fn(() => [replyTool]),
    }
    const runtime = installAppActionTools({
      agents: { get: vi.fn(() => agent) },
      on: vi.fn((event: string, listener: typeof disposed | typeof sessionEvent) => {
        if (event === 'agent/disposed') disposed = listener as typeof disposed
        if (event === 'session/event') sessionEvent = listener as typeof sessionEvent
        return () => {
          if (event === 'agent/disposed') disposed = undefined
          if (event === 'session/event') sessionEvent = undefined
        }
      }),
    } as never, registry)

    const execution = runtime.begin({
      sessionId: 'session-1',
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    })
    expect(registry.actionTools).toHaveBeenCalledWith(
      'reader',
      '/apps/reader',
      ['reader_set_reply_draft'],
    )
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

    sessionEvent?.(agent.session, { type: 'turn/end' })
    expect(toolDispose).toHaveBeenCalledOnce()
    expect(runtime.read(execution.executionId, 0).effects).toHaveLength(1)
    runtime.finish(execution.executionId)
    expect(() => runtime.read(execution.executionId, 0)).toThrow('Unknown or completed')
    runtime.dispose()
  })

  it('rejects concurrent actions in one Session and removes tools when the Agent is disposed', () => {
    const toolDispose = vi.fn()
    const agent = {
      id: 'session-1',
      session: { id: 'session-1', header: { cwd: '/apps/reader' } },
      ctx: { tools: { register: vi.fn(() => toolDispose) } },
    }
    let disposed: ((payload: { readonly agent: typeof agent }) => void) | undefined
    let sessionEvent: ((session: typeof agent.session, event: { readonly type: string }) => void) | undefined
    const runtime = installAppActionTools({
      agents: { get: () => agent },
      on: (event: string, listener: typeof disposed | typeof sessionEvent) => {
        if (event === 'agent/disposed') disposed = listener as typeof disposed
        if (event === 'session/event') sessionEvent = listener as typeof sessionEvent
        return () => {
          if (event === 'agent/disposed') disposed = undefined
          if (event === 'session/event') sessionEvent = undefined
        }
      },
    } as never, { actionTools: () => [replyTool] })
    const request = {
      sessionId: 'session-1',
      appId: 'reader',
      toolNames: ['reader_set_reply_draft'],
    }
    const execution = runtime.begin(request)
    expect(() => runtime.begin(request)).toThrow('already has an active')
    disposed?.({ agent })
    expect(toolDispose).toHaveBeenCalledOnce()
    expect(() => runtime.read(execution.executionId, 0)).toThrow('Unknown or completed')
    runtime.dispose()
  })
})
