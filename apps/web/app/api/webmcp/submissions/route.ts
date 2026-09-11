import { proxySubmission } from '../../../../lib/webmcp-index'
export const dynamic = 'force-dynamic'
export const GET = (request: Request) => proxySubmission(request)
export const POST = (request: Request) => proxySubmission(request)
export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store',
  } })
}
