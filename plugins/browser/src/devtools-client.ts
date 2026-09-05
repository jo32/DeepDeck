import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ListRootsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { BrowserDevToolsLease } from './native-contract.js'

export const DEVTOOLS_VERSION = '1.8.0'
export const DEVTOOLS_FLAGS = ['--no-usageStatistics', '--no-performanceCrux', '--redactNetworkHeaders']
export function devtoolsEntrypoint(): string {
  return join(dirname(createRequire(import.meta.url).resolve('chrome-devtools-mcp/package.json')), 'build/src/bin/chrome-devtools-mcp.js')
}
export interface DevToolsConnection {
  tools: Tool[]
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult>
  close(): Promise<void>
}
/** The official server runs locally over MCP stdio; CDP is restricted by its lease. */
export async function connectDevTools(lease: BrowserDevToolsLease, workspacePath: string): Promise<DevToolsConnection> {
  const client = new Client({ name: 'deepdeck-browser', version: '0.1.0' }, { capabilities: { roots: { listChanged: false } } })
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(workspacePath).href, name: 'Browser site workspace' }] }))
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [devtoolsEntrypoint(), ...DEVTOOLS_FLAGS, '--wsEndpoint', lease.wsEndpoint, '--wsHeaders', JSON.stringify({ Authorization: `Bearer ${lease.token}` })],
    cwd: workspacePath, stderr: 'pipe', env: { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' } })
  transport.stderr?.on('data', () => { /* Diagnostics are returned by MCP; keep protocol logs out of model context. */ })
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    return { tools, call: (name, args, signal) => client.callTool({ name, arguments: args }, undefined, { timeout: 120_000, ...(signal ? { signal } : {}) }) as Promise<CallToolResult>, close: () => client.close() }
  } catch (error) { await client.close().catch(() => undefined); throw error }
}
