import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { BrowserNativeClient } from './native-client.js'

class Carrier extends EventEmitter {
  sent: Record<string, unknown>[] = []
  send(message: unknown): boolean { this.sent.push(message as Record<string, unknown>); return true }
}
describe('native Browser request correlation', () => {
  it('ignores unrelated results and resolves the actual tool result', async () => {
    const carrier = new Carrier(), client = new BrowserNativeClient(carrier)
    const result = client.request({ action: 'snapshot' })
    carrier.emit('message', { type: 'deepdeck:browser:result', requestId: 'another', ok: true, value: 'wrong' })
    const snapshot = { open: false, tabs: [], downloads: [] }
    carrier.emit('message', { type: 'deepdeck:browser:result', requestId: carrier.sent[0]!.requestId, ok: true, value: snapshot })
    await expect(result).resolves.toEqual(snapshot)
    client.dispose()
    expect(carrier.listenerCount('message')).toBe(0)
  })
  it('accepts the native screenshot envelope and rejects malformed or stale responses', async () => {
    const carrier = new Carrier(), client = new BrowserNativeClient(carrier)
    for (const value of ['data:image/png;base64,AQID', { image: 'data:image/png;base64,AQID', documentId: 'stale' }, { image: 'not-an-image', documentId: 'doc' }]) {
      const result = client.request({ action: 'page.screenshot', tabId: 'tab', documentId: 'doc' })
      carrier.emit('message', { type: 'deepdeck:browser:result', requestId: carrier.sent.at(-1)!.requestId, ok: true, value })
      await expect(result).rejects.toThrow('Invalid Browser response for page.screenshot')
    }
    const result = client.request({ action: 'page.screenshot', tabId: 'tab', documentId: 'doc' })
    const value = { image: 'data:image/png;base64,AQID', documentId: 'doc' }
    carrier.emit('message', { type: 'deepdeck:browser:result', requestId: carrier.sent.at(-1)!.requestId, ok: true, value })
    await expect(result).resolves.toEqual(value)
    client.dispose()
  })
  it('ignores malformed snapshot events and rejects an invalid success envelope', async () => {
    const carrier = new Carrier(), client = new BrowserNativeClient(carrier)
    carrier.emit('message', { type: 'deepdeck:browser:event', snapshot: { tabs: [null], downloads: [] } })
    expect(client.snapshot).toEqual({ open: false, tabs: [], downloads: [] })
    const result = client.request({ action: 'snapshot' })
    carrier.emit('message', { type: 'deepdeck:browser:result', requestId: carrier.sent[0]!.requestId, ok: true, value: { tabs: [] } })
    await expect(result).rejects.toThrow('Invalid Browser response for snapshot')
    client.dispose()
  })
  it('cancels the native invocation without retrying it', async () => {
    const carrier = new Carrier(), client = new BrowserNativeClient(carrier), abort = new AbortController()
    const result = client.request({ action: 'webmcp.call', tabId: 'tab', documentId: 'doc', frameId: 'frame', name: 'test', input: {}, callId: 'call-one' }, abort.signal)
    abort.abort()
    await expect(result).rejects.toThrow('canceled')
    expect(carrier.sent).toHaveLength(2)
    expect(carrier.sent[1]!.command).toEqual({ action: 'webmcp.cancel', callId: 'call-one' })
    client.dispose()
  })
})
