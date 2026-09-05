import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BrowserClientAction, BrowserMode } from './contracts.js'
import { BROWSER_API_PATH } from './contracts.js'
import { BrowserNativeClient } from './native-client.js'
import { BrowserRuntime, type BrowserHostContext } from './runtime.js'
import { BrowserSiteStore } from './site-store.js'
import { WebMCPStore } from './webmcp-store.js'

export const name = 'deepdeck-browser'
export const inject = ['workspaceRegistry', 'webServer', 'agents', 'tools', 'skills', 'systemPrompt', 'attachments'] as const
interface HostContext extends BrowserHostContext {
  webServer: { register(route: { kind: 'exact'; path: string; handler(request: IncomingMessage, response: ServerResponse): Promise<void> }): () => void }
  reflect: { provide(name: string, value: unknown): () => void }
  effect(setup: () => (() => void), label: string): unknown
}
const UI_COMMANDS = new Set(['auth.respond', 'tab.move', 'tab.mute', 'tab.print', 'tab.save', 'tab.devtools', 'tab.siteInfo', 'window.fullscreen', 'download.control', 'page.menu.configure', 'page.selection.ack', 'snapshot', 'tab.open', 'tab.menu', 'tab.duplicate', 'tab.closeOthers', 'tab.closeRight', 'tab.reopen', 'tab.activate', 'tab.close', 'tab.back', 'tab.forward', 'tab.reload', 'tab.stop', 'tab.navigate', 'layout', 'find', 'zoom'])
export function trustedRequest(request: Pick<IncomingMessage, 'method' | 'headers'>): boolean {
  if (request.method !== 'POST' || typeof request.headers.origin !== 'string' || typeof request.headers.host !== 'string') return false
  try {
    const origin = new URL(request.headers.origin)
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.host && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  } catch { return false }
}
function send(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}
async function readAction(request: IncomingMessage): Promise<BrowserClientAction> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 128 * 1024) throw new Error('Browser request is too large.')
    chunks.push(buffer)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || !('action' in value)) throw new Error('Invalid Browser action.')
  return value as BrowserClientAction
}
function mode(value: unknown): BrowserMode { if (value !== 'use' && value !== 'builder') throw new Error('Invalid Browser mode.'); return value }
export function apply(ctx: HostContext): void {
  ctx.effect(() => {
    const configuredRoot = process.env.DEEPDECK_BROWSER_HOME?.trim()
    const root = configuredRoot ? resolve(configuredRoot) : join(homedir(), 'DeepDeck', 'Browser')
    const native = new BrowserNativeClient()
    const sites = new BrowserSiteStore(root)
    const runtime = new BrowserRuntime(ctx, native, sites, new WebMCPStore(join(root, 'webmcp')))
    const stopService = ctx.reflect.provide('deepdeckBrowser', runtime)
    const stopRoute = ctx.webServer.register({ kind: 'exact', path: BROWSER_API_PATH, async handler(request, response) {
      if (!trustedRequest(request)) { send(response, 403, { error: 'A same-origin desktop request is required.' }); return }
      try {
        await sites.ready
        const input = await readAction(request)
        let result: unknown
        switch (input.action) {
          case 'state': result = await runtime.state(); break
          case 'open': {
            await runtime.restoreScripts()
            const shellUrl = new URL('/?deepdeck-surface=browser', request.headers.origin as string).href
            result = await native.request({ action: 'open', shellUrl, ...(typeof input.url === 'string' ? { url: input.url } : {}) })
            break
          }
          case 'command': {
            if (!input.command || !UI_COMMANDS.has(input.command.action)) throw new Error('This command is available only to a bound Browser Agent.')
            result = await native.request(input.command)
            break
          }
          case 'site.resolve': result = await runtime.resolve(input.tabId); break
          case 'site.bind': result = await runtime.bind(input.siteId, input.sessionId, input.tabId, mode(input.mode)); break
          case 'site.mode': result = await runtime.setMode(input.siteId, mode(input.mode)); break
          case 'site.toggle': {
            if (typeof input.enabled !== 'boolean') throw new Error('Invalid WebMCP enable state.')
            result = await runtime.toggle(input.siteId, input.enabled); break
          }
          case 'site.rollback': {
            const site = sites.get(input.siteId)
            if (typeof input.revision !== 'string' || !input.revision) throw new Error('Choose a saved revision.')
            await runtime.activate(site, input.revision)
            result = await runtime.describe(site)
            break
          }
          default: throw new Error('Unknown Browser action.')
        }
        send(response, 200, result ?? { ok: true })
      } catch (error) { send(response, 400, { error: error instanceof Error ? error.message : String(error) }) }
    } })
    return () => { stopRoute(); stopService(); runtime.dispose() }
  }, 'Browser: native bridge, site Agent and WebMCP services')
}
