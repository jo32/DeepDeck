import { createHash } from 'node:crypto'
import { GitHubWebMCP, boundedResponse } from '../../../plugins/browser/src/github-webmcp.ts'
import { packagePath, parseCatalog, record, repositoryUrl, type WebMCPCatalogEntry } from '../../../plugins/browser/src/webmcp-package.ts'

export interface Env {
  DB: D1Database
  SUBMISSIONS: RateLimit
  GITHUB_TOKEN?: string
  DISCOVER_TOPICS?: string
}
interface Project {
  key: string; repository: string; manifest_path: string; repository_id: number | null
  entry_id: string | null; entry_json: string | null; state: string; canonical_key: string | null
  error: string | null; failures: number; checked_at: number | null; next_check: number; lease_until: number; enabled: number
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const json = (value: unknown, status = 200, extra = {}) => Response.json(value, { status, headers: { ...headers, ...extra } })
class GitHubBudgetExceeded extends Error {}
const errorText = 'Repository validation failed. Check public access, webmcp.json, license, release version and source hash.'

export async function enqueue(env: Env, repository: string, manifestPath: string, now = Date.now()): Promise<Project | null> {
  // Canonical URLs and paths are data only. No arbitrary fetch destinations or execution.
  repository = repositoryUrl(repository); manifestPath = packagePath(manifestPath)
  const old = await env.DB.prepare('SELECT * FROM projects WHERE repository = ? COLLATE NOCASE AND manifest_path = ?').bind(repository, manifestPath).first<Project>()
  if (old) return old // Public retries cannot reset backoff, leases, identity or moderation.
  const key = digest(`${repository.toLowerCase()}:${manifestPath}`)
  await env.DB.prepare(`INSERT OR IGNORE INTO projects(key, repository, manifest_path, created_at)
    SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM projects) < 5000
    AND (SELECT count(*) FROM projects WHERE entry_json IS NULL) < 1000`).bind(key, repository, manifestPath, now).run()
  return env.DB.prepare('SELECT * FROM projects WHERE key = ?').bind(key).first<Project>()
}
async function githubJSON(env: Env, path: string, request: typeof fetch) {
  const response = await request(`https://api.github.com${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {
    accept: 'application/vnd.github+json', 'user-agent': 'DeepDeck-WebMCP-Indexer', ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
  } })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub returned ${response.status}`) }
  return JSON.parse(await boundedResponse(response, 2 * 1024 * 1024)) as unknown
}
export async function refresh(env: Env, project: Project, request: typeof fetch = fetch, now = Date.now()) {
  // Each job has a lease. Expired workers cannot overwrite a newer result.
  const lease = now + 10 * 60_000
  const claimed = await env.DB.prepare('UPDATE projects SET lease_until = ? WHERE key = ? AND enabled = 1 AND lease_until <= ? AND next_check <= ? RETURNING key')
    .bind(lease, project.key, now, now).first()
  if (!claimed) return
  try {
    const deadline = AbortSignal.timeout(45_000)
    const boundedRequest: typeof fetch = (input, init) => request(input, { ...init,
      signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
    })
    let repository = project.repository
    if (project.repository_id) {
      const current = await githubJSON(env, `/repositories/${project.repository_id}`, boundedRequest)
      if (!record(current) || current.id !== project.repository_id) throw new Error('Repository identity changed')
      repository = repositoryUrl(current.html_url) // Follow renames by immutable ID, not a reused old name.
    }
    const github = new GitHubWebMCP(boundedRequest, env.GITHUB_TOKEN)
    const repo = await github.repository(repository)
    const loaded = await github.load(repository, project.manifest_path, undefined, project.repository_id ?? repo.repositoryId, true)
    if (loaded.manifest.license.toUpperCase() === 'UNLICENSED') throw new Error('A redistribution license is required')
    const duplicate = await env.DB.prepare('SELECT key FROM projects WHERE repository_id = ? AND manifest_path = ? AND key != ?')
      .bind(repo.repositoryId, project.manifest_path, project.key).first<{ key: string }>()
    if (duplicate) {
      await env.DB.prepare("UPDATE projects SET state = 'duplicate', canonical_key = ?, lease_until = 0, next_check = ?, error = NULL WHERE key = ? AND lease_until = ?")
        .bind(duplicate.key, now + 86400_000, project.key, lease).run()
      return
    }
    const entry: WebMCPCatalogEntry = {
      id: project.entry_id ?? `gh-${repo.repositoryId}-${digest(project.manifest_path).slice(0, 16)}`,
      repositoryId: repo.repositoryId, repository: repo.repository, manifestPath: project.manifest_path,
      author: repo.author, name: loaded.manifest.name, description: loaded.manifest.description,
      origin: loaded.manifest.origin, tags: loaded.manifest.tags, status: repo.archived ? 'archived' : 'active',
      syncedAt: new Date(now).toISOString(), commit: loaded.provenance.commit,
      ...(loaded.provenance.release ? { version: loaded.manifest.version } : {}),
    }
    parseCatalog({ formatVersion: 1, generatedAt: null, entries: [entry] })
    await env.DB.prepare(`UPDATE projects SET repository_id = ?, entry_id = ?, entry_json = ?, state = 'indexed', error = NULL,
      failures = 0, checked_at = ?, next_check = ?, lease_until = 0 WHERE key = ? AND lease_until = ?`)
      .bind(repo.repositoryId, entry.id, JSON.stringify(entry), now, now + 6 * 3600_000, project.key, lease).run()
  } catch (error) {
    if (error instanceof GitHubBudgetExceeded) {
      await env.DB.prepare('UPDATE projects SET next_check = ?, lease_until = 0 WHERE key = ? AND lease_until = ?')
        .bind((Math.floor(now / 3600_000) + 1) * 3600_000, project.key, lease).run()
      return
    }
    console.warn('WebMCP validation failed', project.key, error instanceof Error ? error.message : 'Unknown error')
    await env.DB.prepare(`UPDATE projects SET state = 'failed', error = ?, failures = failures + 1, checked_at = ?,
      next_check = ?, lease_until = 0 WHERE key = ? AND lease_until = ?`)
      .bind(errorText, now, now + Math.min(86400_000, 300_000 * 2 ** Math.min(project.failures, 9)), project.key, lease).run()
  }
}
export async function discover(env: Env, request: typeof fetch = fetch, now = Date.now()) {
  if (env.DISCOVER_TOPICS !== 'true') return
  const cursor = await env.DB.prepare('UPDATE discovery SET next_check = ? WHERE id = 1 AND next_check <= ? RETURNING page').bind(now + 3600_000, now).first<{ page: number }>()
  if (!cursor) return
  try {
    const results = await githubJSON(env, `/search/repositories?q=topic:webmcp+fork:true&sort=updated&order=desc&per_page=30&page=${cursor.page}`, request)
    if (!record(results) || !Array.isArray(results.items) || results.incomplete_results === true) throw new Error('Incomplete discovery')
    for (const item of results.items) {
      if (record(item) && item.private === false && typeof item.html_url === 'string') await enqueue(env, item.html_url, 'webmcp.json', now)
    }
    await env.DB.prepare('UPDATE discovery SET page = ? WHERE id = 1').bind(results.items.length < 30 || cursor.page >= 10 ? 1 : cursor.page + 1).run()
  } catch (error) { console.warn('WebMCP topic discovery unavailable; will retry next hour.', error instanceof Error ? error.message : 'Unknown error') }
}
export async function scheduled(env: Env, request: typeof fetch = fetch, now = Date.now()) {
  const budgetedRequest: typeof fetch = async (input, init) => {
    const hour = Math.floor(now / 3600_000)
    const budget = env.GITHUB_TOKEN ? 4500 : 40
    const reservation = await env.DB.prepare(`UPDATE github_budget SET hour = ?, used = CASE WHEN hour = ? THEN used + 1 ELSE 1 END
      WHERE id = 1 AND (hour != ? OR used < ?) RETURNING used`).bind(hour, hour, hour, budget).first()
    if (!reservation) throw new GitHubBudgetExceeded()
    return request(input, init)
  }
  // Bound work per tick and retain last verified metadata across transient failures.
  const jobs = await env.DB.prepare("SELECT * FROM projects WHERE enabled = 1 AND state != 'duplicate' AND next_check <= ? AND lease_until <= ? ORDER BY entry_json IS NULL, next_check, created_at LIMIT 10").bind(now, now).all<Project>()
  for (const project of jobs.results) await refresh(env, project, budgetedRequest, now)
  await discover(env, budgetedRequest, now)
  await env.DB.prepare("DELETE FROM projects WHERE entry_json IS NULL AND repository_id IS NULL AND state = 'failed' AND created_at < ? AND lease_until <= ?").bind(now - 7 * 86400_000, now).run()
}
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
  if (request.method === 'GET' && url.pathname === '/health') {
    await env.DB.prepare('SELECT 1').first(); return json({ ok: true })
  }
  if (request.method === 'GET' && url.pathname === '/api/webmcp/catalog') {
    const rows = await env.DB.prepare('SELECT entry_json, error FROM projects WHERE enabled = 1 AND entry_json IS NOT NULL ORDER BY entry_id LIMIT 5000').all<{entry_json: string; error: string | null}>()
    const entries = rows.results.map(row => ({ ...JSON.parse(row.entry_json), ...(row.error ? { status: 'unavailable', syncError: row.error } : {}) }))
    const generatedAt = entries.reduce((latest: string | null, entry) => !latest || entry.syncedAt > latest ? entry.syncedAt : latest, null)
    return json(parseCatalog({ formatVersion: 1, generatedAt, entries }), 200, { 'Cache-Control': 'public, max-age=60, s-maxage=60' })
  }
  if (url.pathname !== '/api/webmcp/submissions') return json({ error: 'Not found' }, 404)
  if (request.method === 'GET') {
    const key = url.searchParams.get('id') ?? ''
    if (!/^[a-f0-9]{64}$|^nga-forums-webmcp$/.test(key)) return json({ error: 'Invalid submission ID' }, 400)
    let row = await env.DB.prepare('SELECT * FROM projects WHERE key = ? AND enabled = 1').bind(key).first<Project>()
    if (row?.canonical_key) row = await env.DB.prepare('SELECT * FROM projects WHERE key = ? AND enabled = 1').bind(row.canonical_key).first<Project>()
    return row ? json({ id: key, status: row.state, entryId: row.entry_id, error: row.error, checkedAt: row.checked_at }) : json({ error: 'Not found' }, 404)
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, OPTIONS' })
  // A global edge limit also bounds traffic arriving through the official-site proxy.
  if (!(await env.SUBMISSIONS.limit({ key: 'submissions' })).success) return json({ error: 'Too many submissions. Try again shortly.' }, 429, { 'Retry-After': '60' })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Use application/json' }, 415)
  let repository: string, manifestPath: string
  try {
    const value = JSON.parse(await boundedResponse(new Response(request.body, { headers: request.headers }), 2048))
    if (!record(value)) throw new Error('Invalid submission')
    repository = repositoryUrl(value.repository); manifestPath = packagePath(value.manifestPath ?? 'webmcp.json')
  } catch { return json({ error: 'Provide a public GitHub repository URL and a relative manifest path (maximum 2 KB).' }, 400) }
  const row = await enqueue(env, repository, manifestPath)
  if (!row) return json({ error: 'Index queue is full. Try again later.' }, 503)
  if (!row.enabled) return json({ error: 'This repository is not eligible for indexing.' }, 403)
  return json({ id: row.key, status: row.state, entryId: row.entry_id, statusUrl: `/api/webmcp/submissions?id=${row.key}` }, row.state === 'indexed' ? 200 : 202)
}
export default {
  async fetch(request: Request, env: Env) {
    try { return await handle(request, env) } catch { return json({ error: 'Index service unavailable.' }, 503) }
  },
  async scheduled(_controller: ScheduledController, env: Env) { await scheduled(env) },
} satisfies ExportedHandler<Env>
