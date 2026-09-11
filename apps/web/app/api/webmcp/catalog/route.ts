import { readCatalog } from '../../../../lib/webmcp-index'

export const dynamic = 'force-dynamic'
export async function GET() {
  const result = await readCatalog()
  return Response.json(result.catalog, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-WebMCP-Source': result.source,
  } })
}
