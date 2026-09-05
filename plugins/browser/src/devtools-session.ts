import { connectDevTools, DEVTOOLS_VERSION, type DevToolsConnection } from './devtools-client.js'
import type { BrowserDevToolsLease, BrowserTarget } from './native-contract.js'
import type { BrowserNativeClient } from './native-client.js'

// Tab creation and closure are owned by the native Browser, not Puppeteer.
const BROWSER_MANAGED = new Set(['new_page', 'close_page', 'list_webmcp_tools', 'execute_webmcp_tool'])
export class BrowserDevToolsSession {
  private current: { tabId: string; lease: BrowserDevToolsLease; connection: DevToolsConnection } | undefined
  private starting: Promise<void> | undefined
  private closed = false
  private busy = false
  constructor(private native: BrowserNativeClient, private connect = connectDevTools) {}
  private async ensure(target: BrowserTarget, workspace: string): Promise<DevToolsConnection> {
    if (this.closed) throw new Error('This DevTools session is closed.')
    if (this.starting) await this.starting
    if (this.current?.tabId === target.tabId) return this.current.connection
    await this.disconnect()
    this.starting = (async () => {
      const lease = await this.native.request({ action: 'devtools.open', ...target, workspacePath: workspace })
      try {
        const connection = await this.connect(lease, workspace)
        if (this.closed) { await connection.close(); throw new Error('DevTools session closed while connecting.') }
        this.current = { tabId: target.tabId, lease, connection }
      } catch (error) { await this.native.request({ action: 'devtools.close', leaseId: lease.id }).catch(() => undefined); throw error }
    })()
    try { await this.starting } finally { this.starting = undefined }
    return this.current!.connection
  }
  async list(target: BrowserTarget, workspace: string) {
    const connection = await this.ensure(target, workspace)
    return { server: 'chrome-devtools-mcp', version: DEVTOOLS_VERSION, ...target,
      tools: connection.tools.filter(tool => !BROWSER_MANAGED.has(tool.name)),
      tabControls: 'Use browser_open_tab and browser_close_tab for native Browser tabs; browser_select_tab binds another same-site tab.',
      webmcp: 'Use browser_context and browser_webmcp_call for WebMCP discovery and execution with explicit frame, document and revision identities.' }
  }
  async call(target: BrowserTarget, workspace: string, name: string, args: Record<string, unknown>, signal: AbortSignal) {
    if (BROWSER_MANAGED.has(name)) throw new Error('Use browser_context/browser_webmcp_call for WebMCP, and browser_open_tab/browser_close_tab for tabs.')
    if (this.busy) throw new Error('Wait for the current DevTools operation to finish.')
    this.busy = true
    let lease: BrowserDevToolsLease | undefined
    try {
      signal.throwIfAborted()
      const connection = await this.ensure(target, workspace)
      signal.throwIfAborted()
      if (BROWSER_MANAGED.has(name) || !connection.tools.some(tool => tool.name === name)) throw new Error('Discover the available DevTools tools before calling one.')
      lease = this.current!.lease
      await this.native.request({ action: 'devtools.begin', ...target, leaseId: lease.id }, signal)
      const result = await connection.call(name, args, signal)
      if (result.isError) await this.disconnect()
      return result
    } catch (error) {
      // A failed/aborted MCP request may already have acted. Reconnect only on a
      // future explicit call, and never replay the failed operation.
      await this.disconnect()
      throw error
    } finally {
      if (lease) await this.native.request({ action: 'devtools.end', leaseId: lease.id }).catch(() => undefined)
      this.busy = false
    }
  }
  private async disconnect(): Promise<void> {
    const current = this.current
    this.current = undefined
    if (!current) return
    await current.connection.close().catch(() => undefined)
    await this.native.request({ action: 'devtools.close', leaseId: current.lease.id }).catch(() => undefined)
  }
  async close(): Promise<void> { this.closed = true; await this.starting?.catch(() => undefined); await this.disconnect() }
}
