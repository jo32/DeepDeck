import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  BunBuilderApiRequest,
  BunBuilderApiResponse,
} from './api-types.js'
import type { BunPluginBuilderService } from './builder.js'
import { isBunBuildFailure } from './builder.js'

const MAX_REQUEST_BYTES = 32 * 1024

type JsonObject = Record<string, unknown>

export const BUN_PLUGIN_BUILDER_API_PATH = '/api/deepdeck/bun-plugin-builder'

interface WebServer {
  register(route: {
    readonly kind: 'exact'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
  }): () => void
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.replaceAll(/[\r\n\t]+/gu, ' ').slice(0, 500) || 'unknown error'
}

function sameOrigin(request: IncomingMessage): boolean {
  const host = request.headers.host
  const origin = request.headers.origin
  if (typeof host !== 'string' || typeof origin !== 'string') return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

async function readRequest(request: IncomingMessage): Promise<BunBuilderApiRequest> {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new Error('content type must be application/json')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_REQUEST_BYTES) throw new Error('request body exceeds 32 KiB')
    chunks.push(buffer)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!isObject(value) || typeof value.action !== 'string') throw new Error('request body is invalid')
  if (value.action === 'status') return { action: 'status' }
  if (value.action === 'preview') {
    if (
      typeof value.sourceDirectory !== 'string'
      || (value.packageSubdirectory !== undefined && typeof value.packageSubdirectory !== 'string')
    ) throw new Error('preview request is invalid')
    return {
      action: 'preview',
      sourceDirectory: value.sourceDirectory,
      ...(value.packageSubdirectory === undefined ? {} : { packageSubdirectory: value.packageSubdirectory }),
    }
  }
  if (value.action === 'build') {
    if (typeof value.previewId !== 'string' || typeof value.confirmation !== 'string') {
      throw new Error('build request is invalid')
    }
    return { action: 'build', previewId: value.previewId, confirmation: value.confirmation }
  }
  if (value.action === 'hot-update') {
    if (typeof value.previewId !== 'string' || typeof value.confirmation !== 'string') {
      throw new Error('hot-update request is invalid')
    }
    return { action: 'hot-update', previewId: value.previewId, confirmation: value.confirmation }
  }
  if (value.action === 'discard') {
    if (typeof value.previewId !== 'string') throw new Error('discard request is invalid')
    return { action: 'discard', previewId: value.previewId }
  }
  throw new Error('unknown builder action')
}

function sendJson(response: ServerResponse, status: number, body: BunBuilderApiResponse): void {
  const value = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(value),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  response.end(value)
}

export function registerBunPluginBuilderRoute(
  webServer: WebServer,
  builder: BunPluginBuilderService,
): () => void {
  return webServer.register({
    kind: 'exact',
    path: BUN_PLUGIN_BUILDER_API_PATH,
    async handler(request, response) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { ok: false, error: 'method not allowed' })
        return
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { ok: false, error: 'same-origin request required' })
        return
      }
      const controller = new AbortController()
      request.once('aborted', () => controller.abort())
      response.once('close', () => {
        if (!response.writableEnded) controller.abort()
      })
      try {
        const body = await readRequest(request)
        if (body.action === 'status') {
          sendJson(response, 200, { ok: true, status: await builder.status(controller.signal) })
          return
        }
        if (body.action === 'preview') {
          sendJson(response, 200, {
            ok: true,
            preview: await builder.preview({
              sourceDirectory: body.sourceDirectory,
              ...(body.packageSubdirectory === undefined
                ? {}
                : { packageSubdirectory: body.packageSubdirectory }),
            }, controller.signal),
          })
          return
        }
        if (body.action === 'build') {
          sendJson(response, 200, {
            ok: true,
            result: await builder.build({
              previewId: body.previewId,
              confirmation: body.confirmation,
              signal: controller.signal,
            }),
          })
          return
        }
        if (body.action === 'hot-update') {
          sendJson(response, 200, {
            ok: true,
            hotUpdate: await builder.hotUpdate({
              previewId: body.previewId,
              confirmation: body.confirmation,
              signal: controller.signal,
            }),
          })
          return
        }
        await builder.discard(body.previewId)
        sendJson(response, 200, { ok: true, discarded: true })
      } catch (cause) {
        if (response.headersSent) return
        sendJson(response, 400, {
          ok: false,
          error: boundedError(cause),
          ...(isBunBuildFailure(cause) ? { logs: cause.logs } : {}),
        })
      }
    },
  })
}
