import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { rm, stat } from 'node:fs/promises'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const APP_AGENT_COMMAND = '__open-computer-use-app-agent'
const CONNECT_TIMEOUT_MS = 10_000
const CONNECT_RETRY_MS = 50
export const APP_AGENT_REQUEST_TIMEOUT_MS = 30_000
export const APP_AGENT_HEALTH_CHECK_INTERVAL_MS = 5_000
export const APP_AGENT_HEALTH_CHECK_TIMEOUT_MS = 5_000
export const APP_AGENT_SHUTDOWN_TIMEOUT_MS = 2_000
const UNIX_SOCKET_PATH_LIMIT = 103
const execFileAsync = promisify(execFile)

interface AgentInfo {
  readonly bundleURL?: unknown
  readonly processStartTime?: unknown
}

interface AgentResponse {
  readonly error?: unknown
  readonly response?: unknown
  readonly [key: string]: unknown
}

export interface AppAgentConnection {
  request(payload: Readonly<Record<string, unknown>>): Promise<AgentResponse>
  close(): void
}

export type ConnectAppAgent = (
  appBundle: string,
  socketPath?: string,
) => Promise<AppAgentConnection>

export class AppAgentRequestTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`DeepDeck Computer Use app agent did not respond within ${milliseconds}ms; its connection was reset`)
    this.name = 'AppAgentRequestTimeoutError'
  }
}

class JsonLineConnection implements AppAgentConnection {
  private buffer = ''
  private readonly lines: string[] = []
  private readonly waiters: Array<{
    resolve: (line: string) => void
    reject: (error: Error) => void
  }> = []
  private terminalError: Error | undefined

  constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      this.buffer += chunk
      let newline = this.buffer.indexOf('\n')
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline)
        this.buffer = this.buffer.slice(newline + 1)
        const waiter = this.waiters.shift()
        if (waiter) waiter.resolve(line)
        else this.lines.push(line)
        newline = this.buffer.indexOf('\n')
      }
    })
    socket.on('error', error => { this.fail(error) })
    socket.on('close', () => {
      this.fail(new Error('DeepDeck Computer Use app agent closed the connection'))
    })
  }

  async request(payload: Readonly<Record<string, unknown>>): Promise<AgentResponse> {
    if (this.terminalError) throw this.terminalError
    const response = this.readLine()
    this.socket.write(`${JSON.stringify(payload)}\n`)
    const parsed = JSON.parse(await response) as AgentResponse
    if (typeof parsed.error === 'string') throw new Error(parsed.error)
    return parsed
  }

  close(): void {
    this.socket.destroy()
  }

  private readLine(): Promise<string> {
    const line = this.lines.shift()
    if (line !== undefined) return Promise.resolve(line)
    if (this.terminalError) return Promise.reject(this.terminalError)
    return new Promise<string>((resolveLine, rejectLine) => {
      this.waiters.push({ resolve: resolveLine, reject: rejectLine })
    })
  }

  private fail(error: Error): void {
    if (this.terminalError) return
    this.terminalError = error
    for (const waiter of this.waiters.splice(0)) waiter.reject(error)
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolveSleep => { setTimeout(resolveSleep, milliseconds) })
}

export function appAgentSocketPath(appBundle: string, temporaryDirectory = tmpdir()): string {
  const fingerprint = createHash('sha256').update(resolve(appBundle)).digest('hex').slice(0, 12)
  const name = `deepdeck-cu-agent-${fingerprint}.sock`
  const candidate = join(temporaryDirectory, name)
  return Buffer.byteLength(candidate) <= UNIX_SOCKET_PATH_LIMIT ? candidate : join('/tmp', name)
}

async function connect(socketPath: string): Promise<AppAgentConnection> {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = createConnection(socketPath)
    const fail = (error: Error): void => {
      socket.destroy()
      rejectConnection(error)
    }
    socket.once('error', fail)
    socket.once('connect', () => {
      socket.off('error', fail)
      resolveConnection(new JsonLineConnection(socket))
    })
  })
}

async function tryConnect(socketPath: string): Promise<AppAgentConnection | undefined> {
  try {
    return await connect(socketPath)
  } catch {
    return undefined
  }
}

async function isCurrentAgent(client: AppAgentConnection, appBundle: string): Promise<boolean> {
  const info = await client.request({ kind: 'agentInfo' }) as AgentInfo
  if (typeof info.bundleURL !== 'string' || resolve(info.bundleURL) !== resolve(appBundle)) return false
  if (typeof info.processStartTime !== 'number') return false

  const executable = join(appBundle, 'Contents', 'MacOS', 'OpenComputerUse')
  try {
    const executableStat = await stat(executable)
    return info.processStartTime + 0.5 >= executableStat.mtimeMs / 1_000
  } catch {
    return true
  }
}

async function retireAgent(client: AppAgentConnection, socketPath: string): Promise<void> {
  try {
    await client.request({ kind: 'terminate' })
  } catch {
    // A stale or incompatible peer is discarded below.
  } finally {
    client.close()
  }

  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const active = await tryConnect(socketPath)
    if (!active) break
    active.close()
    await sleep(CONNECT_RETRY_MS)
  }
  await rm(socketPath, { force: true })
}

export async function connectOrLaunchAppAgent(
  appBundle: string,
  socketPath = appAgentSocketPath(appBundle),
): Promise<AppAgentConnection> {
  const existing = await tryConnect(socketPath)
  if (existing) {
    try {
      if (await isCurrentAgent(existing, appBundle)) return existing
    } catch {
      // Retire a server that does not implement the expected protocol.
    }
    await retireAgent(existing, socketPath)
  } else {
    await rm(socketPath, { force: true })
  }

  await execFileAsync('/usr/bin/open', [
    '-n',
    appBundle,
    '--args',
    APP_AGENT_COMMAND,
    socketPath,
  ])

  const deadline = Date.now() + CONNECT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const client = await tryConnect(socketPath)
    if (client) return client
    await sleep(CONNECT_RETRY_MS)
  }
  throw new Error(`Timed out waiting for ${basename(appBundle)} app agent`)
}

function isRetrySafeRequest(payload: Readonly<Record<string, unknown>>): boolean {
  if (payload.kind !== 'mcp' || typeof payload.line !== 'string') return false
  try {
    const request = JSON.parse(payload.line) as {
      method?: unknown
      params?: { name?: unknown }
    }
    if (request.method !== 'tools/call') return true
    return request.params?.name === 'list_apps' || request.params?.name === 'get_app_state'
  } catch {
    return false
  }
}

async function requestWithTimeout(
  client: AppAgentConnection,
  payload: Readonly<Record<string, unknown>>,
  milliseconds: number,
): Promise<AgentResponse> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      client.request(payload),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => { reject(new AppAgentRequestTimeoutError(milliseconds)) }, milliseconds)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/**
 * Reconnect between MCP lines when macOS quits the helper during a TCC
 * "Quit & Reopen" transition. Read-only calls may be retried once after a
 * broken socket; action calls are never replayed because their side effect may
 * already have happened before the connection closed.
 */
export class RecoveringAppAgentConnection implements AppAgentConnection {
  private client: AppAgentConnection | undefined
  private closed = false
  private tail: Promise<void> = Promise.resolve()
  private readonly healthTimer: ReturnType<typeof setInterval>

  constructor(
    private readonly appBundle: string,
    private readonly socketPath = appAgentSocketPath(appBundle),
    private readonly connector: ConnectAppAgent = connectOrLaunchAppAgent,
    private readonly requestTimeoutMs = APP_AGENT_REQUEST_TIMEOUT_MS,
    healthCheckIntervalMs = APP_AGENT_HEALTH_CHECK_INTERVAL_MS,
    private readonly healthCheckTimeoutMs = APP_AGENT_HEALTH_CHECK_TIMEOUT_MS,
  ) {
    this.healthTimer = setInterval(() => {
      void this.enqueue(async () => {
        if (this.closed || !this.client) return
        try {
          await this.requestInternal({
            kind: 'mcp',
            line: JSON.stringify({
              jsonrpc: '2.0',
              id: `deepdeck-health-${Date.now()}`,
              method: 'ping',
            }),
            environment: {},
          }, this.healthCheckTimeoutMs)
        } catch {
          // requestInternal has already discarded the broken connection. Do
          // not wait for the next user tool call to restore the helper.
          if (!this.closed) {
            try {
              this.client = await this.connector(this.appBundle, this.socketPath)
            } catch {
              // The next health interval retries LaunchServices startup.
            }
          }
        }
      })
    }, healthCheckIntervalMs)
    this.healthTimer.unref?.()
  }

  request(payload: Readonly<Record<string, unknown>>): Promise<AgentResponse> {
    return this.enqueue(() => this.requestInternal(payload, this.requestTimeoutMs))
  }

  private async requestInternal(
    payload: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<AgentResponse> {
    if (this.closed) throw new Error('DeepDeck Computer Use app-agent connection is closed')
    const attempts = isRetrySafeRequest(payload) ? 2 : 1
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let active: AppAgentConnection | undefined
      try {
        active = this.client ?? await this.connector(this.appBundle, this.socketPath)
        if (this.closed) {
          active.close()
          throw new Error('DeepDeck Computer Use app-agent connection is closed')
        }
        this.client = active
        return await requestWithTimeout(active, payload, timeoutMs)
      } catch (error) {
        lastError = error
        if (this.client === active) this.client = undefined
        active?.close()
        // A hung native operation should fail promptly, not be repeated for
        // another full timeout. The following MCP line gets a fresh connection.
        if (error instanceof AppAgentRequestTimeoutError) break
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.healthTimer)
    this.client?.close()
    this.client = undefined
  }

  /**
   * Gracefully stop the private native helper when the enabled MCP loader row
   * is disposed. This never launches a helper: if Computer Use has not made a
   * native connection, shutdown is a no-op after clearing the health timer.
   */
  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    clearInterval(this.healthTimer)
    const active = this.client
    this.client = undefined
    if (!active) return
    try {
      await requestWithTimeout(active, { kind: 'terminate' }, APP_AGENT_SHUTDOWN_TIMEOUT_MS)
    } catch {
      // Closing the private socket is the fallback if graceful termination is
      // unavailable. A later enable cycle retires any stale server instance.
    } finally {
      active.close()
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task)
    this.tail = result.then(() => {}, () => {})
    return result
  }
}

function proxiedEnvironment(environment: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[0].startsWith('OPEN_COMPUTER_USE_') && entry[1] !== undefined,
    ),
  )
}

export async function proxyMcp(
  client: AppAgentConnection,
  input = process.stdin,
  output = process.stdout,
): Promise<void> {
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      const response = await client.request({
        kind: 'mcp',
        line,
        environment: proxiedEnvironment(),
      })
      if (typeof response.response === 'string') output.write(`${response.response}\n`)
    } catch (error) {
      let request: { id?: unknown } | undefined
      try {
        request = JSON.parse(line) as { id?: unknown }
      } catch {
        // The native server reports malformed notification input when alive;
        // if it is unavailable there is no request id to correlate.
      }
      if (request?.id === undefined) continue
      output.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32001,
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`)
    }
  }
}

export async function main(arguments_ = process.argv.slice(2)): Promise<void> {
  const [appBundle, command, ...rest] = arguments_
  if (!appBundle || command !== 'mcp' || rest.length > 0) {
    throw new Error('Usage: app-agent-proxy <Open Computer Use.app> mcp')
  }
  const client = new RecoveringAppAgentConnection(appBundle)
  let terminating = false
  const terminate = (): void => {
    if (terminating) return
    terminating = true
    void client.shutdown().finally(() => { process.exit(0) })
  }
  process.once('SIGINT', terminate)
  process.once('SIGTERM', terminate)
  try {
    await proxyMcp(client)
  } finally {
    process.off('SIGINT', terminate)
    process.off('SIGTERM', terminate)
    await client.shutdown()
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
