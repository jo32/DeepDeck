import snapshot from '../../../../public/webmcp/catalog.json'
import { parseCatalog } from '../../../../../../plugins/browser/src/webmcp-package.ts'

// GitHub is read and verified during the build, never on a client's request.
// The API and directory pages publish together as one immutable deployment.
export const dynamic = 'force-static'

export function GET() {
  return Response.json(parseCatalog(snapshot), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      ...(process.env.VERCEL_GIT_COMMIT_SHA ? { 'X-WebMCP-Registry-Commit': process.env.VERCEL_GIT_COMMIT_SHA } : {}),
    },
  })
}
