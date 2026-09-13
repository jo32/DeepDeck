import { boundedResponse } from '../../../plugins/browser/src/bounded-response.ts'
import { digest } from '../../../plugins/browser/src/webmcp-submission.ts'
import type { Env } from './index.ts'

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200, extra = {}) => Response.json(value, { status, headers: { ...headers, ...extra } })
const goals = ['compare', 'regression', 'readiness']
const surfaces = ['screenshots', 'accessibility', 'dom', 'undecided']
function parse(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
  const v = value as Record<string, unknown>
  const field = (key: string, min: number, max: number) => {
    const text = typeof v[key] === 'string' ? v[key].trim() : ''
    if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('invalid')
    return text
  }
  const id = field('id', 36, 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('invalid')
  const email = field('email', 3, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || v.consent !== true || (v.website !== undefined && v.website !== '')) throw new Error('invalid')
  const goal = field('goal', 1, 30), surface = field('surface', 1, 30)
  if (!goals.includes(goal) || !surfaces.includes(surface) || !['zh', 'en'].includes(String(v.locale))) throw new Error('invalid')
  return { id: id.toLowerCase(), team: field('team', 1, 120), email, target: field('target', 1, 200), goal, surface, tasks: field('tasks', 10, 2000), locale: String(v.locale), consentVersion: 'benchmark-pilot-2026-09' }
}

export async function handleBenchmarkApplication(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405, { Allow: 'POST' })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'unsupported_media_type' }, 415)
  try {
    // A separate key leaves the directory publication quota unaffected.
    if (!(await env.SUBMISSIONS.limit({ key: 'benchmark-intake' })).success) return reply({ error: 'rate_limited' }, 429, { 'Retry-After': '60' })
    let raw: string
    try { raw = await boundedResponse(new Response(request.body, { headers: request.headers }), 16 * 1024) }
    catch { return reply({ error: 'payload_too_large' }, 413) }
    let data: ReturnType<typeof parse>
    try { data = parse(JSON.parse(raw)) } catch { return reply({ error: 'invalid_application' }, 400) }
    const hash = digest(JSON.stringify(data))
    const existing = await env.DB.prepare('SELECT payload_hash FROM benchmark_applications WHERE id = ?').bind(data.id).first<{ payload_hash: string }>()
    if (existing) return existing.payload_hash === hash ? reply({ status: 'received', id: data.id }) : reply({ error: 'request_conflict' }, 409)
    await env.DB.prepare(`INSERT OR IGNORE INTO benchmark_applications
      (id, payload_hash, team, email, target, goal, surface, tasks, locale, consent_version, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM benchmark_applications) < 5000`)
      .bind(data.id, hash, data.team, data.email, data.target, data.goal, data.surface, data.tasks, data.locale, data.consentVersion, Date.now()).run()
    const saved = await env.DB.prepare('SELECT payload_hash FROM benchmark_applications WHERE id = ?').bind(data.id).first<{ payload_hash: string }>()
    if (!saved) return reply({ error: 'temporarily_unavailable' }, 503)
    if (saved.payload_hash !== hash) return reply({ error: 'request_conflict' }, 409)
    return reply({ status: 'received', id: data.id }, 201)
  } catch { return reply({ error: 'temporarily_unavailable' }, 503) }
}
