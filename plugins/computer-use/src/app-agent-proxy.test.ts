import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  AppAgentRequestTimeoutError,
  RecoveringAppAgentConnection,
  appAgentSocketPath,
  proxyMcp,
  type AppAgentConnection,
} from './app-agent-proxy.ts'

describe('DeepDeck Computer Use app-agent proxy', () => {
  it('derives a stable per-bundle socket without using the upstream global name', () => {
    const first = appAgentSocketPath('/Applications/DeepDeck.app/Computer Use.app', '/tmp')
    const duplicate = appAgentSocketPath('/Applications/DeepDeck.app/Computer Use.app', '/tmp')
    const development = appAgentSocketPath('/workspace/Open Computer Use.app', '/tmp')

    expect(first).toBe(duplicate)
    expect(first).not.toBe(development)
    expect(first).toMatch(/^\/tmp\/deepdeck-cu-agent-[a-f0-9]{12}\.sock$/)
    expect(first).not.toContain('open-computer-use-agent.sock')
  })

  it('falls back to /tmp when the macOS temporary directory would exceed the socket limit', () => {
    const socket = appAgentSocketPath('/Applications/DeepDeck.app/Computer Use.app', `/${'x'.repeat(100)}`)
    expect(socket).toMatch(/^\/tmp\/deepdeck-cu-agent-[a-f0-9]{12}\.sock$/)
  })

  it('does not launch a helper merely to run the idle health timer', async () => {
    const connector = vi.fn()
    const connection = new RecoveringAppAgentConnection(
      '/runtime/Open Computer Use.app',
      '/tmp/deepdeck-test.sock',
      connector,
      100,
      5,
      100,
    )

    await new Promise(resolve => { setTimeout(resolve, 25) })

    expect(connector).not.toHaveBeenCalled()
    await connection.shutdown()
    expect(connector).not.toHaveBeenCalled()
  })

  it('forwards MCP lines and suppresses notification responses', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    let rendered = ''
    output.setEncoding('utf8')
    output.on('data', chunk => { rendered += chunk })
    const request = vi.fn(async (payload: Readonly<Record<string, unknown>>) => (
      payload.line === '{"method":"notifications/initialized"}'
        ? { response: null }
        : { response: '{"jsonrpc":"2.0","id":1,"result":{}}' }
    ))
    const client: AppAgentConnection = { request, close: vi.fn() }

    const pending = proxyMcp(client, input, output)
    input.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n\n{"method":"notifications/initialized"}\n')
    await pending

    expect(request).toHaveBeenCalledTimes(2)
    expect(rendered).toBe('{"jsonrpc":"2.0","id":1,"result":{}}\n')
  })

  it('reconnects and retries a read-only request after the helper disappears', async () => {
    const first: AppAgentConnection = {
      request: vi.fn(async () => { throw new Error('socket closed') }),
      close: vi.fn(),
    }
    const second: AppAgentConnection = {
      request: vi.fn(async () => ({ response: '{"jsonrpc":"2.0","id":1,"result":{}}' })),
      close: vi.fn(),
    }
    const connector = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    const connection = new RecoveringAppAgentConnection(
      '/runtime/Open Computer Use.app',
      '/tmp/deepdeck-test.sock',
      connector,
      100,
      60_000,
      100,
    )

    const response = await connection.request({
      kind: 'mcp',
      line: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_apps', arguments: {} },
      }),
    })

    expect(response.response).toContain('"result"')
    expect(connector).toHaveBeenCalledTimes(2)
    expect(first.close).toHaveBeenCalledOnce()
    connection.close()
  })

  it('never replays an action after a broken connection', async () => {
    const first: AppAgentConnection = {
      request: vi.fn(async () => { throw new Error('socket closed after write') }),
      close: vi.fn(),
    }
    const connector = vi.fn(async () => first)
    const connection = new RecoveringAppAgentConnection(
      '/runtime/Open Computer Use.app',
      '/tmp/deepdeck-test.sock',
      connector,
      100,
      60_000,
      100,
    )

    await expect(connection.request({
      kind: 'mcp',
      line: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'click', arguments: { app: 'Chrome', element_index: 1 } },
      }),
    })).rejects.toThrow('socket closed after write')

    expect(connector).toHaveBeenCalledOnce()
    connection.close()
  })

  it('bounds a hung request and uses a fresh connection for the next line', async () => {
    const hung: AppAgentConnection = {
      request: vi.fn(() => new Promise(() => {})),
      close: vi.fn(),
    }
    const healthy: AppAgentConnection = {
      request: vi.fn(async () => ({ response: 'ok' })),
      close: vi.fn(),
    }
    const connector = vi.fn()
      .mockResolvedValueOnce(hung)
      .mockResolvedValueOnce(healthy)
    const connection = new RecoveringAppAgentConnection(
      '/runtime/Open Computer Use.app',
      '/tmp/deepdeck-test.sock',
      connector,
      10,
      60_000,
      100,
    )

    await expect(connection.request({
      kind: 'mcp',
      line: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })).rejects.toBeInstanceOf(AppAgentRequestTimeoutError)
    expect(hung.close).toHaveBeenCalledOnce()

    await expect(connection.request({
      kind: 'mcp',
      line: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })).resolves.toMatchObject({ response: 'ok' })
    expect(connector).toHaveBeenCalledTimes(2)
    connection.close()
  })

  it('health-checks and relaunches a helper that dies while idle', async () => {
    const first: AppAgentConnection = {
      request: vi.fn(async (payload: Readonly<Record<string, unknown>>) => {
        const line = typeof payload.line === 'string' ? JSON.parse(payload.line) as { method?: string } : {}
        if (line.method === 'ping') throw new Error('helper terminated')
        return { response: 'ready' }
      }),
      close: vi.fn(),
    }
    const second: AppAgentConnection = {
      request: vi.fn(async () => ({ response: 'healthy' })),
      close: vi.fn(),
    }
    const connector = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    const connection = new RecoveringAppAgentConnection(
      '/runtime/Open Computer Use.app',
      '/tmp/deepdeck-test.sock',
      connector,
      100,
      5,
      100,
    )

    await connection.request({
      kind: 'mcp',
      line: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    await vi.waitFor(() => { expect(connector).toHaveBeenCalledTimes(2) })

    expect(first.close).toHaveBeenCalledOnce()
    expect(second.request).toHaveBeenCalledWith(expect.objectContaining({
      line: expect.stringContaining('"method":"ping"'),
    }))
    connection.close()
  })

  it('terminates the private helper when the enabled MCP runtime is disposed', async () => {
    const client: AppAgentConnection = {
      request: vi.fn(async () => ({ response: 'ready' })),
      close: vi.fn(),
    }
    const connector = vi.fn(async () => client)
    const connection = new RecoveringAppAgentConnection(
      '/runtime/Open Computer Use.app',
      '/tmp/deepdeck-test.sock',
      connector,
      100,
      60_000,
      100,
    )

    await connection.request({
      kind: 'mcp',
      line: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    await connection.shutdown()

    expect(client.request).toHaveBeenLastCalledWith({ kind: 'terminate' })
    expect(client.close).toHaveBeenCalledOnce()
    expect(connector).toHaveBeenCalledOnce()
  })

  it('returns a correlated MCP error and continues after one native failure', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    let rendered = ''
    output.setEncoding('utf8')
    output.on('data', chunk => { rendered += chunk })
    const client: AppAgentConnection = {
      request: vi.fn()
        .mockRejectedValueOnce(new Error('helper unavailable'))
        .mockResolvedValueOnce({ response: '{"jsonrpc":"2.0","id":2,"result":{}}' }),
      close: vi.fn(),
    }

    const pending = proxyMcp(client, input, output)
    input.end('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n')
    await pending

    const lines = rendered.trim().split('\n').map(line => JSON.parse(line) as { id: number; error?: unknown })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ id: 1, error: { code: -32001, message: 'helper unavailable' } })
    expect(lines[1]).toMatchObject({ id: 2 })
  })
})
