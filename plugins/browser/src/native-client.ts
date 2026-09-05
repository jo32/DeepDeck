import { randomUUID } from 'node:crypto'
import type { BrowserNativeCommand, BrowserNativeResponse, BrowserSnapshot, BrowserNativeResult } from './native-contract.js'
import { isBrowserNativeResponse, isBrowserSnapshot } from './native-response.js'

interface Carrier {
  send?: ((message: unknown) => boolean) | undefined
  on(event: 'message', listener: (value: unknown) => void): unknown
  removeListener(event: 'message', listener: (value: unknown) => void): unknown
}

export class BrowserNativeClient {
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>()
  private stopped = false
  snapshot: BrowserSnapshot = { open: false, tabs: [], downloads: [] }
  constructor(private readonly carrier: Carrier = process) {
    carrier.on('message', this.receive)
  }
  get available(): boolean { return !this.stopped && typeof this.carrier.send === 'function' }
  private receive = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return
    const message = value as Record<string, unknown>
    if (message.type === 'deepdeck:browser:event') {
      const snapshot = message.snapshot as BrowserSnapshot | undefined
      if (snapshot && isBrowserSnapshot(snapshot)) this.snapshot = snapshot
      return
    }
    if (message.type !== 'deepdeck:browser:result' || typeof message.requestId !== 'string') return
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    const result = value as BrowserNativeResult
    if (result.ok) pending.resolve(result.value)
    else pending.reject(new Error(result.error || 'Browser request failed'))
  }
  async request<C extends BrowserNativeCommand>(command: C, signal?: AbortSignal): Promise<BrowserNativeResponse<C>> {
    signal?.throwIfAborted()
    if (!this.available) throw new Error('Browser requires the DeepDeck desktop application.')
    const requestId = randomUUID()
    return await new Promise<BrowserNativeResponse<C>>((resolve, reject) => {
      const cleanup = (): void => {
        this.pending.delete(requestId)
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      const fail = (error: Error): void => { cleanup(); reject(error) }
      const cancelCall = (): void => {
        if (command.action === 'webmcp.call') {
          try { this.carrier.send?.({ type: 'deepdeck:browser:request', requestId: randomUUID(), command: { action: 'webmcp.cancel', callId: command.callId } }) } catch { /* carrier is closing */ }
        }
      }
      const abort = (): void => { cancelCall(); fail(new Error('Browser operation canceled; any already completed page action is not replayed.')) }
      const timer = setTimeout(() => { cancelCall(); fail(new Error('Browser operation timed out; its execution outcome may be unknown.')) }, command.action === 'webmcp.call' ? 120_000 : ['tab.close', 'tab.closeOthers', 'tab.closeRight', 'tab.save', 'tab.siteInfo'].includes(command.action) ? 900_000 : 30_000)
      this.pending.set(requestId, { resolve: value => {
        if (!isBrowserNativeResponse(command, value)) { fail(new Error(`Invalid Browser response for ${command.action}.`)); return }
        cleanup(); resolve(value)
      }, reject: fail })
      signal?.addEventListener('abort', abort, { once: true })
      try { this.carrier.send!({ type: 'deepdeck:browser:request', requestId, command }) }
      catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
    })
  }
  dispose(): void {
    this.stopped = true
    this.carrier.removeListener('message', this.receive)
    for (const pending of [...this.pending.values()]) pending.reject(new Error('Browser runtime disconnected.'))
  }
}
