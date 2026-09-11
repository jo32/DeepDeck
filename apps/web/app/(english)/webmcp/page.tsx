import type { Metadata } from 'next'
import { readCatalog } from '../../../lib/webmcp-index'
import { WebMCPDirectory } from '../../_components/webmcp-directory'

export const metadata: Metadata = {
  title: 'WebMCP Directory — DeepDeck',
  description: 'Discover WebMCP tools for websites. Read the source, install a version, and collaborate on GitHub.',
  alternates: { canonical: '/webmcp', languages: { en: '/webmcp', 'zh-CN': '/zh/webmcp' } },
}
export const dynamic = 'force-dynamic'
export default async function Page() { const { catalog, source } = await readCatalog(); return <WebMCPDirectory source={source} catalog={catalog} locale="en" /> }
