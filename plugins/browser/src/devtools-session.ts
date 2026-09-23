import { connectDevTools, DEVTOOLS_VERSION, type DevToolsConnection } from './devtools-client.js'
import type { BrowserDevToolsLease, BrowserTarget } from './native-contract.js'
import type { BrowserNativeClient } from './native-client.js'

// Tab creation and closure are owned by the native Browser, not Puppeteer.
const BROWSER_MANAGED = new Set(['new_page', 'close_page', 'list_webmcp_tools', 'execute_webmcp_tool'])
export interface DevToolsStep { name: string; arguments: Record<string, unknown> }
interface StepTiming { index: number; name: string; totalMs: number; mcpMs: number }
export const MAX_DEVTOOLS_STEPS = 8
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
  async list(target: BrowserTarget, workspace: string, names?: string[]) {
    if (this.busy) throw new Error('Wait for the current DevTools operation to finish.')
    const connection = await this.ensure(target, workspace)
    const available = connection.tools.filter(tool => !BROWSER_MANAGED.has(tool.name))
    return { server: 'chrome-devtools-mcp', version: DEVTOOLS_VERSION, ...target,
      tools: available.filter(tool => !names || names.includes(tool.name)),
      ...(names ? { missing: names.filter(name => !available.some(tool => tool.name === name)) } : {}),
      tabControls: 'Use browser_open_tab and browser_close_tab for native Browser tabs; browser_select_tab binds another same-site tab.',
      webmcp: 'Call the registered webmcp__ tools directly with business parameters. browser_context refreshes their callable names; the host binds frame, document and revision identities.' }
  }
  async call(target: BrowserTarget, workspace: string, name: string, args: Record<string, unknown>, signal: AbortSignal) {
    if (BROWSER_MANAGED.has(name)) throw new Error('Use browser_context and registered webmcp__ tools for WebMCP, and browser_open_tab/browser_close_tab for tabs.')
    if (this.busy) throw new Error('Wait for the current DevTools operation to finish.')
    this.busy = true
    try { return await this.perform(target, workspace, name, args, signal) }
    finally { this.busy = false }
  }
  async batch(target: BrowserTarget, workspace: string, steps: DevToolsStep[], signal: AbortSignal) {
    if (!steps.length || steps.length > MAX_DEVTOOLS_STEPS) throw new Error(`Provide 1–${MAX_DEVTOOLS_STEPS} DevTools steps.`)
    if (this.busy) throw new Error('Wait for the current DevTools operation to finish.')
    this.busy = true
    const started = performance.now()
    const timing = { totalMs: 0, connectionMs: 0, steps: [] as StepTiming[] }
    // A successful MCP return (even a screenshot) is evidence to inspect, not
    // an assertion that the user's semantic, visual or persistence goal passed.
    const verification = { postcondition: 'not_checked', visual: 'not_checked', persistence: 'not_checked' } as const
    const receipt = () => ({ verification, timing: { ...timing, totalMs: performance.now() - started } })
    const results: Array<{ index: number; name: string; result: Awaited<ReturnType<DevToolsConnection['call']>> }> = []
    try {
      signal.throwIfAborted()
      const connection = await this.ensure(target, workspace)
      timing.connectionMs = performance.now() - started
      // Reject unsupported plans before the first action can change the page.
      for (const step of steps) {
        if (BROWSER_MANAGED.has(step.name) || !connection.tools.some(tool => tool.name === step.name)) throw new Error('Discover the available DevTools tools before calling one. Use registered webmcp__ tools for WebMCP and native Browser tools for tabs.')
      }
      for (const [index, step] of steps.entries()) {
        const stepStarted = performance.now()
        const stepTiming: StepTiming = { index, name: step.name, totalMs: 0, mcpMs: 0 }
        timing.steps.push(stepTiming)
        try {
          // Every step checks the ORIGINAL document through devtools.begin.
          // A preceding click can navigate even without navigate_page.
          const result = await this.perform(target, workspace, step.name, step.arguments, signal, stepTiming)
          stepTiming.totalMs = performance.now() - stepStarted
          results.push({ index, name: step.name, result })
          if (!result.isError) continue
        } catch (error) {
          stepTiming.totalMs = performance.now() - stepStarted
          return { status: 'stopped', completed: index, stoppedAt: index, results, ...receipt(), error: String(error), recovery: 'The stopped step may have acted. Inspect current state before continuing; do not replay the batch.' }
        }
        return { status: 'stopped', completed: index, stoppedAt: index, results, ...receipt(), recovery: 'The stopped step may have acted. Inspect current state before continuing; do not replay the batch.' }
      }
      return { status: 'completed', completed: steps.length, results, ...receipt() }
    } finally { this.busy = false }
  }
  private async perform(target: BrowserTarget, workspace: string, name: string, args: Record<string, unknown>, signal: AbortSignal, timing?: StepTiming) {
    let lease: BrowserDevToolsLease | undefined
    try {
      signal.throwIfAborted()
      const connection = await this.ensure(target, workspace)
      signal.throwIfAborted()
      if (BROWSER_MANAGED.has(name) || !connection.tools.some(tool => tool.name === name)) throw new Error('Discover the available DevTools tools before calling one.')
      lease = this.current!.lease
      await this.native.request({ action: 'devtools.begin', ...target, leaseId: lease.id }, signal)
      const started = performance.now()
      const result = await connection.call(name, args, signal).finally(() => {
        if (timing) timing.mcpMs = performance.now() - started
      })
      if (result.isError) await this.disconnect()
      return result
    } catch (error) {
      // A failed/aborted MCP request may already have acted. Reconnect only on a
      // future explicit call, and never replay the failed operation.
      await this.disconnect()
      throw error
    } finally {
      if (lease) await this.native.request({ action: 'devtools.end', leaseId: lease.id }).catch(() => undefined)
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
