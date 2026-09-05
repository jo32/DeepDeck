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
