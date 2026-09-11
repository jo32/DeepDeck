import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { boundedResponse } from '../plugins/browser/src/github-webmcp.ts'
import { parseCatalog, WEBMCP_CATALOG_URL } from '../plugins/browser/src/webmcp-package.ts'

/** Explicitly refresh offline fallbacks from the index; never part of a website build. */
export async function syncCatalog(root: string, mode: 'write' | 'check' | 'validate', request: typeof fetch = fetch, endpoint = WEBMCP_CATALOG_URL) {
  const response = await request(endpoint, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok || response.headers.get('x-webmcp-source') === 'bundled') throw new Error('Live index unavailable; snapshots unchanged.')
  const catalog = parseCatalog(JSON.parse(await boundedResponse(response, 32 * 1024 * 1024)))
  const paths = ['apps/web/public/webmcp/catalog.json', 'plugins/browser/catalog.json'].map(path => resolve(root, path))
  if (mode === 'check') {
    for (const path of paths) if (JSON.stringify(parseCatalog(JSON.parse(await readFile(path, 'utf8')))) !== JSON.stringify(catalog)) throw new Error('Offline catalog differs from the live index. Run pnpm webmcp:sync.')
  } else if (mode === 'write') {
    for (const path of paths) {
      const temporary = `${path}.${process.pid}.tmp`
      await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n'); await rename(temporary, path)
    }
  }
  return catalog.entries.length
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--validate') ? 'validate' : 'write'
  const count = await syncCatalog(fileURLToPath(new URL('../', import.meta.url)), mode)
  console.log(`Fetched ${count} indexed WebMCP projects.`)
}
