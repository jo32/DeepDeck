import snapshot from '../public/webmcp/catalog.json'
import { parseCatalog } from '../../../plugins/browser/src/webmcp-package.ts'
import { boundedResponse } from '../../../plugins/browser/src/bounded-response.ts'

export function indexURL(path: string): URL | null {
  const configured = process.env.WEBMCP_INDEX_URL
  if (!configured) return null
  const base = new URL(configured)
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && base.hostname === '127.0.0.1'))) throw new Error('Invalid WEBMCP_INDEX_URL')
  return new URL(path, base)
}
export async function readCatalog(request: typeof fetch = fetch) {
  try {
    const url = indexURL('/api/webmcp/catalog')
    if (url) {
      const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) })
      if (!response.ok) { await response.body?.cancel(); throw new Error('Index unavailable') }
      return { catalog: parseCatalog(JSON.parse(await boundedResponse(response, 32 * 1024 * 1024))), source: 'live' as const }
    }
  } catch { /* An outage must not erase the bundled directory. */ }
  return { catalog: parseCatalog(snapshot), source: 'bundled' as const }
}
export async function proxySubmission(request: Request, transport: typeof fetch = fetch) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  try {
    const url = indexURL('/api/webmcp/submissions')
    if (!url) return Response.json({ error: 'Repository indexing is not configured yet.' }, { status: 503, headers })
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id') ?? ''
      if (!/^[a-f0-9]{64}$|^nga-forums-webmcp$/.test(id)) return Response.json({ error: 'Invalid submission ID' }, { status: 400, headers })
      url.searchParams.set('id', id)
    }
    if (request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Use application/json' }, { status: 415, headers })
    let body: string | undefined
    if (request.method === 'POST') {
      try { body = await boundedResponse(new Response(request.body, { headers: request.headers }), 4 * 1024 * 1024) }
      catch { return Response.json({ error: 'Publication exceeds 4 MB.' }, { status: 413, headers }) }
    }
    const response = await transport(url, { method: request.method, ...(body === undefined ? {} : { body }), headers: { 'Content-Type': 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) })
    const value: unknown = JSON.parse(await boundedResponse(response, 8192))
    return Response.json(value, { status: response.status, headers: { ...headers, ...(response.status === 429 ? { 'Retry-After': '60' } : {}) } })
  } catch { return Response.json({ error: 'Index service unavailable. Try again later.' }, { status: 503, headers }) }
}
