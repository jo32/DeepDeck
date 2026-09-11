import { boundedResponse } from '../../../plugins/browser/src/bounded-response.ts'
import { parseCatalog } from '../../../plugins/browser/src/webmcp-package.ts'
import { digest, MAX_SUBMISSION_BYTES, parseSubmission, submissionEntry, submissionKey } from '../../../plugins/browser/src/webmcp-submission.ts'

export interface Env { DB: D1Database; SUBMISSIONS: RateLimit }
interface Project {
  key: string; repository: string; manifest_path: string; repository_id: number | null
  entry_id: string | null; entry_json: string | null; state: string; canonical_key: string | null
  error: string | null; checked_at: number | null; enabled: number
  publisher_token_hash: string | null; publication_digest: string | null
}
const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const json = (value: unknown, status = 200, extra = {}) => Response.json(value, { status, headers: { ...headers, ...extra } })

/** No fetches, background jobs, repository scripts or GitHub credentials. */
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
  if (request.method === 'GET' && url.pathname === '/health') {
    await env.DB.prepare('SELECT 1').first(); return json({ ok: true, indexing: 'direct-publication' })
  }
  if (request.method === 'GET' && url.pathname === '/api/webmcp/catalog') {
    const rows = await env.DB.prepare('SELECT entry_json FROM projects WHERE enabled = 1 AND entry_json IS NOT NULL ORDER BY entry_id LIMIT 5000').all<{ entry_json: string }>()
    // Keep previously verified entries. Old GitHub polling errors no longer
    // determine whether a published package can be discovered or installed.
    const entries = rows.results.map(row => JSON.parse(row.entry_json))
    const generatedAt = entries.reduce((latest: string | null, entry) => !latest || entry.syncedAt > latest ? entry.syncedAt : latest, null)
    return json(parseCatalog({ formatVersion: 1, generatedAt, entries }))
  }
  if (url.pathname !== '/api/webmcp/submissions') return json({ error: 'Not found' }, 404)
  if (request.method === 'GET') {
    const key = url.searchParams.get('id') ?? ''
    if (!/^[a-f0-9]{64}$|^nga-forums-webmcp$/.test(key)) return json({ error: 'Invalid submission ID' }, 400)
    let row = await env.DB.prepare('SELECT * FROM projects WHERE key = ? AND enabled = 1').bind(key).first<Project>()
    if (row?.canonical_key) row = await env.DB.prepare('SELECT * FROM projects WHERE key = ? AND enabled = 1').bind(row.canonical_key).first<Project>()
    return row ? json({ id: key, status: row.entry_json ? 'indexed' : 'needs_package', entryId: row.entry_id, checkedAt: row.checked_at,
      error: row.entry_json ? null : 'Publish the manifest and source with the updated DeepDeck publication workflow. URL-only submissions are no longer queued.' }) : json({ error: 'Not found' }, 404)
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, OPTIONS' })
  if (!(await env.SUBMISSIONS.limit({ key: 'submissions' })).success) return json({ error: 'Too many publications. Try again shortly.' }, 429, { 'Retry-After': '60' })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Use application/json' }, 415)
  let body: string
  try { body = await boundedResponse(new Response(request.body, { headers: request.headers }), MAX_SUBMISSION_BYTES) }
  catch { return json({ error: 'Publication exceeds 4 MB.' }, 413) }
  let publication: ReturnType<typeof parseSubmission>
  try { publication = parseSubmission(JSON.parse(body)) }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid publication.' }, 400) }
  const { repository, repositoryId, manifestPath, manifest, commit } = publication
  const tokenHash = digest(publication.publisherToken)
  const publicationDigest = digest(JSON.stringify({ repository, repositoryId, manifestPath, manifest, commit }))
  let row = await env.DB.prepare('SELECT * FROM projects WHERE repository = ? COLLATE NOCASE AND manifest_path = ?').bind(repository, manifestPath).first<Project>()
  if (row && !row.enabled) return json({ error: 'This project is not eligible for indexing.' }, 403)
  if (row?.publisher_token_hash && row.publisher_token_hash !== tokenHash) return json({ error: 'Use this project’s saved publication credential to update its listing.' }, 403)
  // A migrated, previously verified project must keep its established identity.
  // Its initial update credential is provisioned during the one-time migration.
  if (row?.entry_json && !row.publisher_token_hash) return json({ error: 'This legacy listing requires publication credential migration.' }, 409)
  if (row?.repository_id && row.repository_id !== repositoryId) return json({ error: 'The repository identity does not match this listing.' }, 409)
  const other = await env.DB.prepare('SELECT key FROM projects WHERE repository_id = ? AND manifest_path = ? AND key != ?').bind(repositoryId, manifestPath, row?.key ?? '').first()
  if (other) return json({ error: 'This repository identity already has a listing.' }, 409)
  const key = row?.key ?? submissionKey(repository, manifestPath)
  const now = Date.now()
  const entry = submissionEntry(publication, row?.entry_id ?? `gh-${repositoryId}-${digest(manifestPath).slice(0, 16)}`, now)
  parseCatalog({ formatVersion: 1, generatedAt: entry.syncedAt, entries: [entry] })
  if (!row) {
    await env.DB.prepare(`INSERT OR IGNORE INTO projects(key, repository, manifest_path, created_at, publisher_token_hash)
      SELECT ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM projects) < 5000`).bind(key, repository, manifestPath, now, tokenHash).run()
    row = await env.DB.prepare('SELECT * FROM projects WHERE key = ?').bind(key).first<Project>()
    if (!row) return json({ error: 'Index capacity reached.' }, 503)
  }
  if (row.publisher_token_hash && row.publisher_token_hash !== tokenHash) return json({ error: 'Use this project’s saved publication credential to update its listing.' }, 403)
  if (row.publication_digest !== publicationDigest) {
    const updated = await env.DB.prepare(`UPDATE projects SET repository_id = ?, entry_id = ?, entry_json = ?, state = 'indexed',
      error = NULL, failures = 0, checked_at = ?, next_check = 0, lease_until = 0, publisher_token_hash = ?, publication_digest = ?, manifest_json = ?
      WHERE key = ? AND enabled = 1 AND (publisher_token_hash = ? OR (publisher_token_hash IS NULL AND entry_json IS NULL)) RETURNING key`)
      .bind(repositoryId, entry.id, JSON.stringify(entry), now, tokenHash, publicationDigest, JSON.stringify(manifest), key, tokenHash).first()
    if (!updated) return json({ error: 'The publication credential or listing changed. Retry with the saved project credential.' }, 409)
  }
  return json({ id: key, status: 'indexed', entryId: entry.id, commit, sourceSha256: manifest.sourceSha256, statusUrl: `/api/webmcp/submissions?id=${key}` })
}

export default {
  async fetch(request: Request, env: Env) {
    try { return await handle(request, env) } catch { return json({ error: 'Index service unavailable.' }, 503) }
  },
} satisfies ExportedHandler<Env>
