import { describe, expect, it, vi } from 'vitest'
import { BrowserDevToolsSession } from './devtools-session.js'
import type { BrowserNativeClient } from './native-client.js'
import type { DevToolsConnection } from './devtools-client.js'

function fixture() {
  const request = vi.fn(async (command: { action: string }) => command.action === 'devtools.open' ? { id: 'lease', wsEndpoint: 'ws://127.0.0.1:1234/devtools/browser/test', token: 'secret' } : {})
  const call = vi.fn<DevToolsConnection['call']>(async () => ({ content: [{ type: 'text', text: 'actual result' }] }))
  const close = vi.fn(async () => {})
  const connect = vi.fn(async () => ({ tools: ['list_pages', 'take_snapshot', 'new_page', 'close_page', 'list_webmcp_tools', 'execute_webmcp_tool'].map(name => ({ name, inputSchema: { type: 'object' as const } })), call, close }))
  const session = new BrowserDevToolsSession({ request } as unknown as BrowserNativeClient, connect)
  return { session, request, call, close, connect }
}
const target = { tabId: 'tab-a', documentId: 'doc-a' }
const signal = () => new AbortController().signal

describe('official DevTools MCP lifecycle', () => {
  it('discovers schemas without replacing native Browser tab ownership', async () => {
    const f = fixture()
    const result = await f.session.list(target, '/site')
    expect(result.tools.map(t => t.name)).toEqual(['list_pages', 'take_snapshot'])
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(f.connect).toHaveBeenCalledWith(expect.objectContaining({ id: 'lease' }), '/site')
    await f.session.close()
    expect(f.close).toHaveBeenCalledOnce()
  })
  it('locks the exact document and releases it after a real MCP result', async () => {
    const f = fixture()
    await expect(f.session.call(target, '/site', 'take_snapshot', { pageId: 1 }, signal())).resolves.toMatchObject({ content: [{ text: 'actual result' }] })
    expect(f.request.mock.calls.map(([c]) => c.action)).toEqual(['devtools.open', 'devtools.begin', 'devtools.end'])
    expect(f.request).toHaveBeenCalledWith({ action: 'devtools.begin', ...target, leaseId: 'lease' }, expect.any(AbortSignal))
    await f.session.close()
  })
  it('rejects both guessed and previously discovered alternate WebMCP entry points', async () => {
    const f = fixture()
    for (const name of ['list_webmcp_tools', 'execute_webmcp_tool']) {
      await expect(f.session.call(target, '/site', name, { toolName: 'deepdeck_saved' }, signal())).rejects.toThrow('browser_webmcp_call')
    }
    expect(f.connect).not.toHaveBeenCalled()
    expect(f.call).not.toHaveBeenCalled()
    await f.session.close()
  })
  it('closes the old connection when explicitly binding a different tab', async () => {
    const f = fixture()
    await f.session.list(target, '/site')
    await f.session.list({ tabId: 'tab-b', documentId: 'doc-b' }, '/site')
    expect(f.connect).toHaveBeenCalledTimes(2)
    expect(f.close).toHaveBeenCalledOnce()
    await f.session.close()
  })
  it('does not replay an uncertain failure, and only reconnects for a later explicit call', async () => {
    const f = fixture()
    f.call.mockRejectedValueOnce(new Error('connection lost; outcome unknown'))
    await expect(f.session.call(target, '/site', 'take_snapshot', {}, signal())).rejects.toThrow('outcome unknown')
    expect(f.call).toHaveBeenCalledOnce()
    expect(f.close).toHaveBeenCalledOnce()
    await f.session.call(target, '/site', 'take_snapshot', {}, signal())
    expect(f.connect).toHaveBeenCalledTimes(2)
    await f.session.close()
  })
  it('closes failed browser connections reported as MCP isError results', async () => {
    const f = fixture()
    f.call.mockResolvedValueOnce({ content: [{ type: 'text', text: 'browser disconnected' }], isError: true })
    await expect(f.session.call(target, '/site', 'list_pages', {}, signal())).resolves.toMatchObject({ isError: true })
    expect(f.close).toHaveBeenCalledOnce()
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('cancels before connecting and rejects concurrent operations', async () => {
    const f = fixture()
    const abort = new AbortController(); abort.abort()
    await expect(f.session.call(target, '/site', 'list_pages', {}, abort.signal)).rejects.toThrow()
    expect(f.connect).not.toHaveBeenCalled()
    let finish!: () => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ content: [] }) }))
    const running = f.session.call(target, '/site', 'list_pages', {}, signal())
    await vi.waitFor(() => expect(f.call).toHaveBeenCalledOnce())
    await expect(f.session.call(target, '/site', 'list_pages', {}, signal())).rejects.toThrow('current DevTools')
    finish(); await running; await f.session.close()
  })
})


describe('DevTools batches', () => {
  const steps = [
    { name: 'list_pages', arguments: {} },
    { name: 'take_snapshot', arguments: { pageId: 1 } },
  ]
  it('returns focused schemas and reports missing or Browser-managed names', async () => {
    const f = fixture()
    expect(await f.session.list(target, '/site', ['take_snapshot', 'new_page', 'missing'])).toMatchObject({
      tools: [{ name: 'take_snapshot' }], missing: ['new_page', 'missing'],
    })
    await f.session.close()
  })
  it('executes in order on one connection, validating the original document for each step', async () => {
    const f = fixture()
    expect(await f.session.batch(target, '/site', steps, signal())).toMatchObject({ status: 'completed', completed: 2, results: [{ index: 0 }, { index: 1 }] })
    expect(f.call.mock.calls.map(([name]) => name)).toEqual(['list_pages', 'take_snapshot'])
    expect(f.connect).toHaveBeenCalledOnce()
    expect(f.request.mock.calls.filter(([c]) => c.action === 'devtools.begin')).toEqual([
      [{ action: 'devtools.begin', ...target, leaseId: 'lease' }, expect.any(AbortSignal)],
      [{ action: 'devtools.begin', ...target, leaseId: 'lease' }, expect.any(AbortSignal)],
    ])
    await f.session.close()
  })
  it('preflights names and limits before any page action', async () => {
    const f = fixture()
    for (const bad of [[], Array(9).fill(steps[0]), [...steps, { name: 'new_page', arguments: {} }], [...steps, { name: 'guessed', arguments: {} }]]) {
      await expect(f.session.batch(target, '/site', bad, signal())).rejects.toThrow()
    }
    expect(f.call).not.toHaveBeenCalled()
    await f.session.close()
  })
  it.each(['mcp', 'transport', 'navigation', 'abort'])('stops after %s failure, preserving results without replay', async failure => {
    const f = fixture()
    const abort = new AbortController()
    f.call.mockImplementationOnce(async () => {
      if (failure === 'abort') abort.abort()
      if (failure === 'navigation') f.request.mockImplementation(async command => {
        if (command.action === 'devtools.begin') throw new Error('Stale document')
        return {}
      })
      return { content: [{ type: 'text', text: 'first action completed' }] }
    })
    if (failure === 'mcp') f.call.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: 'failed' }] })
    if (failure === 'transport') f.call.mockRejectedValueOnce(new Error('Connection lost'))
    const result = await f.session.batch(target, '/site', [...steps, steps[0]!], abort.signal)
    expect(result).toMatchObject({ status: 'stopped', completed: 1, stoppedAt: 1, results: [{ index: 0, result: { content: [{ text: 'first action completed' }] } } , ...(failure === 'mcp' ? [{ index: 1 }] : [])] })
    expect(result.recovery).toContain('do not replay')
    expect(f.call).toHaveBeenCalledTimes(['mcp', 'transport'].includes(failure) ? 2 : 1)
    await f.session.close()
  })
  it('measures connection and failed MCP time without claiming semantic verification', async () => {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const f = fixture()
    f.connect.mockImplementationOnce(async () => {
      now += 10
      return { tools: steps.map(step => ({ name: step.name, inputSchema: { type: 'object' as const } })), call: f.call, close: f.close }
    })
    f.call.mockImplementationOnce(async () => { now += 25; return { content: [] } })
    f.call.mockImplementationOnce(async () => { now += 7; throw new Error('Disconnected after dispatch') })
    try {
      const result = await f.session.batch(target, '/site', steps, signal())
      expect(result).toMatchObject({ status: 'stopped', completed: 1, verification: {
        postcondition: 'not_checked', visual: 'not_checked', persistence: 'not_checked',
      }, timing: { totalMs: 42, connectionMs: 10, steps: [
        { index: 0, totalMs: 25, mcpMs: 25 }, { index: 1, totalMs: 7, mcpMs: 7 },
      ] } })
      expect(f.call).toHaveBeenCalledTimes(2)
    } finally { clock.mockRestore(); await f.session.close() }
  })
  it('holds the session lock across the batch and releases it afterward', async () => {
    const f = fixture()
    let finish!: () => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ content: [] }) }))
    const pending = f.session.batch(target, '/site', steps, signal())
    await vi.waitFor(() => expect(f.call).toHaveBeenCalledOnce())
    await expect(f.session.call(target, '/site', 'list_pages', {}, signal())).rejects.toThrow('current DevTools')
    await expect(f.session.batch(target, '/site', steps, signal())).rejects.toThrow('current DevTools')
    await expect(f.session.list(target, '/site')).rejects.toThrow('current DevTools')
    finish()
    await pending
    await f.session.call(target, '/site', 'list_pages', {}, signal())
    await f.session.close()
  })
})
