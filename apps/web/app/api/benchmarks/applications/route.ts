import { indexURL } from '../../../../lib/webmcp-index';
import { boundedResponse } from '../../../../../../plugins/browser/src/bounded-response';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'unsupported_media_type' }, { status: 415, headers });
  let body: string;
  try { body = await boundedResponse(new Response(request.body, { headers: request.headers }), 16 * 1024); }
  catch { return Response.json({ error: 'payload_too_large' }, { status: 413, headers }); }
  try {
    const url = indexURL('/api/benchmarks/applications');
    if (!url) throw new Error('Not configured');
    const upstream = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const value = JSON.parse(await boundedResponse(upstream, 4096));
    if (upstream.ok && (value.status !== 'received' || !/^[a-f0-9-]{36}$/.test(value.id))) throw new Error('Invalid receipt');
    return Response.json(value, { status: upstream.status, headers: { ...headers, ...(upstream.status === 429 ? { 'Retry-After': '60' } : {}) } });
  } catch { return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers }); }
}
