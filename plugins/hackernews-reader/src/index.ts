import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  clearHackerNewsCredentials,
  readHackerNewsCredentials,
  writeHackerNewsCredentials,
  type CredentialRecordStore,
} from './credentials.js'
import { HackerNewsAuthClient } from './hn-auth.js'
import { HACKER_NEWS_FEEDS, HackerNewsClient } from './hn-api.js'
import { renderHackerNewsReaderPage } from './reader-page.js'

type JsonObject = Record<string, unknown>

type ToolPropertySchema =
  | { readonly type: 'string'; readonly enum?: readonly string[] }
  | { readonly type: 'number' }

type SchemaValue<TSchema extends ToolPropertySchema> =
  TSchema extends { readonly type: 'string' } ? string
    : TSchema extends { readonly type: 'number' } ? number
      : never

type ToolArguments<TProperties extends Record<string, ToolPropertySchema>> = {
  [TKey in keyof TProperties]?: SchemaValue<TProperties[TKey]>
}

interface PluginContext {
  readonly tools: {
    register(definition: unknown): unknown
  }
  readonly credentials: CredentialRecordStore
  readonly webServer: {
    register(route: {
      readonly kind: 'exact'
      readonly path: string
      readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
    }): () => void
  }
  readonly appConversations: {
    register(definition: {
      readonly id: string
      readonly title: string
      readonly workspaceSlug: string
      readonly workspaceTitle?: string
      readonly packageName: string
      readonly sourcePackageRoot: string
    }): () => void
  }
  effect(effect: () => unknown, label: string): unknown
}

export interface HackerNewsReaderContext {
  readonly feed: string
  readonly query: string
  readonly storyId: number
  readonly storyTitle: string
  readonly storyUrl: string
}

export const HACKERNEWS_READER_API_PATH = '/api/hackernews-reader'
export const HACKERNEWS_READER_PAGE_PATH = '/hackernews-reader'
const HACKERNEWS_READER_PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const inject = ['tools', 'credentials', 'webServer', 'appConversations'] as const

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'Hacker News request timed out'
  return error instanceof Error ? error.message : String(error)
}

function toolDefinition<const TProperties extends Record<string, ToolPropertySchema>>(
  name: string,
  description: string,
  properties: TProperties,
  required: readonly (keyof TProperties & string)[],
  execute: (args: ToolArguments<TProperties>) => unknown | Promise<unknown>,
) {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties,
      ...(required.length === 0 ? {} : { required }),
    },
    output: {
      schema: { type: 'string' },
      render(_args: ToolArguments<TProperties>, value: string) {
        return [{ type: 'text', text: value }]
      },
    },
    async execute(args: ToolArguments<TProperties>) {
      try {
        return JSON.stringify(await execute(args), null, 2)
      } catch (error) {
        return `Hacker News error: ${errorMessage(error)}`
      }
    },
  }
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 64 * 1024) throw new Error('request body exceeds 64 KiB')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!isObject(value)) throw new Error('request body must be a JSON object')
  return value
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function sendPage(response: ServerResponse): void {
  const body = renderHackerNewsReaderPage()
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

export function apply(ctx: PluginContext): void {
  const client = new HackerNewsClient()
  const authClient = new HackerNewsAuthClient()
  let current: HackerNewsReaderContext = {
    feed: 'top',
    query: '',
    storyId: 0,
    storyTitle: '',
    storyUrl: '',
  }

  ctx.effect(() => ctx.appConversations.register({
    id: 'hackernews-reader',
    title: 'Hacker News',
    workspaceSlug: 'hackernews-reader',
    workspaceTitle: 'Apps · Hacker News',
    packageName: '@deepdeck/dsh-hackernews-reader',
    sourcePackageRoot: HACKERNEWS_READER_PACKAGE_ROOT,
  }), 'deepdeck hackernews reader: app conversation workspace')

  async function accountStatus(validate = true): Promise<{
    readonly configured: boolean
    readonly username: string
    readonly verified: boolean
    readonly warning?: string
  }> {
    const stored = await readHackerNewsCredentials(ctx.credentials)
    if (stored === null) return { configured: false, username: '', verified: false }
    if (!validate) return { configured: true, username: stored.username, verified: false }
    try {
      const status = await authClient.status(stored.cookie)
      if (!status.valid) {
        await clearHackerNewsCredentials(ctx.credentials)
        return { configured: false, username: '', verified: false }
      }
      if (status.username !== stored.username) {
        await writeHackerNewsCredentials(ctx.credentials, { username: status.username, cookie: stored.cookie })
      }
      return { configured: true, username: status.username, verified: true }
    } catch (error) {
      return {
        configured: true,
        username: stored.username,
        verified: false,
        warning: `Stored session could not be checked: ${errorMessage(error)}`,
      }
    }
  }

  ctx.tools.register(toolDefinition(
    'hackernews_stories',
    'Browse Hacker News stories from top, new, best, ask, show, or jobs.',
    {
      feed: { type: 'string', enum: HACKER_NEWS_FEEDS },
      page: { type: 'number' },
      limit: { type: 'number' },
    },
    ['feed'],
    async args => await client.listStories(args.feed, args.page, args.limit),
  ))
  ctx.tools.register(toolDefinition(
    'hackernews_search',
    'Search Hacker News stories by relevance or newest first.',
    {
      query: { type: 'string' },
      sort: { type: 'string', enum: ['relevance', 'date'] },
      page: { type: 'number' },
      limit: { type: 'number' },
    },
    ['query'],
    async args => await client.searchStories(args.query, args.page, args.sort, args.limit),
  ))
  ctx.tools.register(toolDefinition(
    'hackernews_read_story',
    'Read one Hacker News story and its nested discussion as safe plain text.',
    {
      story_id: { type: 'number' },
      max_comments: { type: 'number' },
    },
    ['story_id'],
    async args => await client.readStory(args.story_id, args.max_comments),
  ))
  ctx.tools.register(toolDefinition(
    'hackernews_user',
    'Read a public Hacker News user profile.',
    { username: { type: 'string' } },
    ['username'],
    async args => await client.user(args.username),
  ))
  ctx.tools.register(toolDefinition(
    'hackernews_current_context',
    'Return the feed, search query, and story currently selected in Hacker News Reader.',
    {},
    [],
    async () => current,
  ))
  ctx.tools.register(toolDefinition(
    'hackernews_account',
    'Return the signed-in Hacker News username and session status. Never returns credentials.',
    {},
    [],
    async () => await accountStatus(false),
  ))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: HACKERNEWS_READER_API_PATH,
    async handler(request, response) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      try {
        const body = await readJsonBody(request)
        const action = typeof body.action === 'string' ? body.action : ''
        const payload = isObject(body.payload) ? body.payload : {}
        if (action === 'open-window') {
          const host = typeof request.headers.host === 'string' ? request.headers.host : ''
          if (host.length === 0) throw new Error('missing Host header')
          const url = `http://${host}${HACKERNEWS_READER_PAGE_PATH}`
          const sent = typeof process.send === 'function'
            ? process.send({ type: 'deepdeck:open-app-window', url })
            : false
          sendJson(response, 200, { sent })
          return
        }
        if (action === 'auth-status') {
          sendJson(response, 200, await accountStatus(payload.validate !== false))
          return
        }
        if (action === 'login') {
          const session = await authClient.login(payload.username, payload.password)
          const stored = await writeHackerNewsCredentials(ctx.credentials, session)
          sendJson(response, 200, { configured: true, username: stored.username, verified: true })
          return
        }
        if (action === 'logout') {
          const stored = await readHackerNewsCredentials(ctx.credentials)
          let remoteInvalidated = false
          let warning: string | undefined
          try {
            if (stored !== null) remoteInvalidated = await authClient.logout(stored.cookie)
          } catch (error) {
            warning = `The local session was removed, but Hacker News could not be reached: ${errorMessage(error)}`
          } finally {
            await clearHackerNewsCredentials(ctx.credentials)
          }
          sendJson(response, 200, {
            configured: false,
            username: '',
            verified: false,
            remoteInvalidated,
            ...(warning === undefined ? {} : { warning }),
          })
          return
        }
        if (action === 'set-context') {
          current = {
            feed: String(payload.feed ?? ''),
            query: String(payload.query ?? ''),
            storyId: Number(payload.storyId ?? 0),
            storyTitle: String(payload.storyTitle ?? ''),
            storyUrl: String(payload.storyUrl ?? ''),
          }
          sendJson(response, 200, current)
          return
        }
        if (action === 'feed') {
          sendJson(response, 200, await client.listStories(payload.feed, payload.page, payload.limit))
          return
        }
        if (action === 'search') {
          sendJson(response, 200, await client.searchStories(payload.query, payload.page, payload.sort, payload.limit))
          return
        }
        if (action === 'story') {
          sendJson(response, 200, await client.readStory(payload.storyId, payload.maxComments))
          return
        }
        if (action === 'user') {
          sendJson(response, 200, await client.user(payload.username))
          return
        }
        sendJson(response, 400, { error: 'unknown action' })
      } catch (error) {
        sendJson(response, 400, { error: errorMessage(error) })
      }
    },
  }), 'deepdeck hackernews reader: api route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: HACKERNEWS_READER_PAGE_PATH,
    async handler(_request, response) {
      sendPage(response)
    },
  }), 'deepdeck hackernews reader: app page')
}
