import type { Metadata } from 'next'
import catalog from '../../../public/webmcp/catalog.json'
import { WebMCPDirectory } from '../../_components/webmcp-directory'

export const metadata: Metadata = {
  title: 'WebMCP Directory — DeepDeck',
  description: 'Discover WebMCP tools for websites. Read the source, install a version, and collaborate on GitHub.',
  alternates: { canonical: '/webmcp', languages: { en: '/webmcp', 'zh-CN': '/zh/webmcp' } },
}
export default function Page() { return <WebMCPDirectory catalog={catalog} locale="en" /> }
