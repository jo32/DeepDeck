import { randomUUID } from 'node:crypto'
import type { BrowserTab, BrowserTool } from './native-contract.js'

export function webmcpCallError(code: string, message: string, recovery: string, execution: 'not_dispatched' | 'unknown' = 'not_dispatched'): Error {
  // Throw so Harness preserves isError; a successful JSON envelope hides failures.
  return new Error(JSON.stringify({ code, execution, message, recovery }))
}

/** Session-local handles preserve the discovered identity without model transcription. */
export class WebMCPReferences {
  private readonly prefix = randomUUID().slice(0, 8)
  private sequence = 0
  private tabId: string | undefined
  private entries = new Map<string, { fingerprint: string; tool: BrowserTool }>()

  clear() {
    this.entries.clear()
    this.tabId = undefined
  }

  discover(tab: BrowserTab): Array<BrowserTool & { toolRef: string }> {
    if (this.tabId !== tab.id) this.clear()
    this.tabId = tab.id
    const previous = new Map([...this.entries].map(([ref, entry]) => [entry.fingerprint, ref]))
    const current = new Map<string, { fingerprint: string; tool: BrowserTool }>()
    const tools = tab.tools.map(tool => {
      // Include the top document and schema as well as frame/version identity.
      const fingerprint = JSON.stringify([tab.documentId, tool])
      const toolRef = previous.get(fingerprint) ?? `w_${this.prefix}_${(++this.sequence).toString(36)}`
      current.set(toolRef, { fingerprint, tool: structuredClone(tool) })
      return { ...tool, toolRef }
    })
    this.entries = current
    return tools
  }

  resolve(toolRef: string, tab: BrowserTab): BrowserTool {
    this.discover(tab)
    const entry = this.entries.get(toolRef)
    if (!entry) throw webmcpCallError('stale_tool_reference', 'The tool reference is unknown or the page changed, tool changed, or bound tab changed.', 'Call browser_context and use the current toolRef. No action was dispatched.')
    return entry.tool
  }
}
