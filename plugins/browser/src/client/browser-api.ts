import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { BROWSER_API_PATH, type BrowserClientAction, type BrowserMode, type BrowserSite, type BrowserState } from '../contracts.js'

export async function browserRequest<T>(action: BrowserClientAction, signal?: AbortSignal): Promise<T> {
  const response = await fetch(BROWSER_API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
    ...(signal === undefined ? {} : { signal }),
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const error = typeof value === 'object' && value !== null && 'error' in value
      ? String(value.error) : `Browser request failed (${String(response.status)})`
    throw new Error(error)
  }
  return value as T
}

/** URLs stay explicit; a phrase becomes an ordinary browser search. */
export function addressTarget(value: string): string {
  const text = value.trim()
  if (text === '') return 'about:blank'
  const hostWithPort = /^(?:localhost|[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*):\d+(?:[/?#]|$)/iu.test(text)
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !hostWithPort) {
    const url = new URL(text)
    if (!['http:', 'https:'].includes(url.protocol) && text !== 'about:blank') throw new Error('Only HTTP and HTTPS websites can be opened.')
    if (url.username || url.password) throw new Error('URLs containing passwords are not supported.')
    return url.href
  }
  if (!/\s/.test(text) && (hostWithPort || /^(localhost(?:[/?#]|$)|(?:[\p{L}\p{N}_-]+\.)+[\p{L}\p{N}_-]+(?:[/?#]|$)|\[[a-f\d:]+\](?::\d+)?(?:[/?#]|$))/iu.test(text))) {
    const parsed = new URL(`https://${text}`)
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) || parsed.hostname.startsWith('[') || hostWithPort && !parsed.hostname.includes('.')) parsed.protocol = 'http:'
    return parsed.href
  }
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

export interface BrowserAgentSelection {
  siteId: string
  sessionId: string
  tabId: string
}

export interface BrowserClientService {
  request: typeof browserRequest
  prepareAgent: (tabId: string, mode: BrowserMode, create: boolean | 'auto', signal?: AbortSignal) => Promise<BrowserAgentSelection | undefined>
}

/** Session history and runtime scope always belong to Harness. */
export function createBrowserClient(ctx: ClientContext): BrowserClientService {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  if (connection === undefined) throw new Error('Browser requires the Harness connection service.')
  const confirmed = new Map<SessionId, { tabId: string; mode: BrowserMode; binding: unknown; generation: unknown }>()
  // Serialize preparation per site. Completing a newly created session's
  // binding is durable even if its caller leaves; the next visit reuses it.
  const preparations = new Map<string, Promise<void>>()
  const createdSessions = new Map<string, SessionId>()
  return {
    request: browserRequest,
    async prepareAgent(tabId, requestedMode, create, signal) {
      let site = await browserRequest<BrowserSite>({ action: 'site.resolve', tabId }, signal)
      const siteId = site.id
      const priorPreparation = preparations.get(siteId)
      let release!: () => void
      const lock = new Promise<void>(resolve => { release = resolve })
      preparations.set(siteId, lock)
      try {
        if (priorPreparation) {
          await priorPreparation
          signal?.throwIfAborted()
          site = await browserRequest<BrowserSite>({ action: 'site.resolve', tabId }, signal)
          if (site.id !== siteId) throw new Error('The target page changed. Reconnect to its Agent.')
        }
        signal?.throwIfAborted()
        // Automatic restore may be triggered by a stale polling snapshot just
        // after the Agent changed modes. Only a user's explicit selection may
        // override the fresh Host mode returned by site.resolve.
        const mode = create === true ? requestedMode : site.mode
        let sessionId = site.sessionId as SessionId | undefined
        if (sessionId !== undefined) {
          const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
          if (summary === undefined) throw new Error('The site session is still connecting. Try again shortly.')
          if (summary.cwd !== site.workspacePath) throw new Error('This session does not belong to the selected website.')
          if (summary.running) {
            // Keep a running task on its original target, including when the
            // user selects another tab of the same site.
            if (site.boundTabId === undefined) throw new Error('The running site task has no saved target. Finish its turn before reconnecting.')
            ctx.sessions.open(sessionId)
            return { siteId: site.id, sessionId, tabId: site.boundTabId }
          }
        } else {
          if (!create) return undefined
          sessionId = createdSessions.get(site.id)
          if (sessionId === undefined) {
            const known = ctx.workspaces.list.getSnapshot().items.find(item => item.path === site.workspacePath)
            const workspace = known ?? await ctx.workspaces.create({ path: site.workspacePath })
            signal?.throwIfAborted()
            const result = await connection.api.sessions.create({ workspaceId: workspace.workspaceId })
            if (!result.result.ok) throw new Error(result.result.error.message)
            sessionId = result.result.value.sessionId
            createdSessions.set(site.id, sessionId)
          }
        }
        // Once created, finish saving its site association before honoring
        // cancellation. A cancelled selection must not orphan a new session.
        const bindingSignal = site.sessionId === undefined ? undefined : signal
        bindingSignal?.throwIfAborted()
        const prior = confirmed.get(sessionId)
        const localBinding = ctx.sessions.binding(sessionId)
        const generation = connection.hostDescription.getSnapshot()
        const alreadyReady = prior !== undefined && localBinding !== undefined
          && prior.binding === localBinding && prior.tabId === tabId && prior.mode === mode
          && prior.generation === generation
          && site.boundTabId === tabId && site.mode === mode
        if (!alreadyReady) {
          if (site.sessionId !== undefined) {
            // The local roster can contain a durable Session whose Host Agent
            // has not been activated yet. This public session-scoped read waits
            // for the Host resolver to resume its recorded preset and cwd.
            // Reading history or selecting the Client Session alone does not.
            const resumed = await connection.api.sessions.models({ sessionId }, signal)
            if (!resumed.result.ok) throw new Error(resumed.result.error.message)
            signal?.throwIfAborted()
          }
          await browserRequest({ action: 'site.bind', siteId: site.id, sessionId, tabId, mode }, bindingSignal)
          createdSessions.delete(site.id)
        }
        const started = Date.now()
        while (ctx.sessions.binding(sessionId) === undefined) {
          bindingSignal?.throwIfAborted()
          if (Date.now() - started > 5000) throw new Error('The site session is still connecting. Try again shortly.')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        confirmed.set(sessionId, { tabId, mode, binding: ctx.sessions.binding(sessionId), generation })
        if (site.sessionId === undefined) {
          const renamed = await ctx.sessions.binding(sessionId)?.session.rename(site.title)
          if (renamed !== undefined && !renamed.ok) throw new Error(renamed.error.message)
        }
        signal?.throwIfAborted()
        ctx.sessions.open(sessionId)
        return { siteId: site.id, sessionId, tabId }
      } finally {
        release()
        if (preparations.get(siteId) === lock) preparations.delete(siteId)
      }
    },
  }
}

export interface BrowserPollState { state?: BrowserState; error?: string }
