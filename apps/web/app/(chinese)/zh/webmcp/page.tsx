import type { Metadata } from 'next'
import { readCatalog } from '../../../../lib/webmcp-index'
import { WebMCPDirectory } from '../../../_components/webmcp-directory'

export const metadata: Metadata = {
  title: 'WebMCP 工具目录 — DeepDeck',
  description: '按网站和任务发现 WebMCP，查看源码，在 GitHub 协作修复过时工具。',
  alternates: { canonical: '/zh/webmcp', languages: { en: '/webmcp', 'zh-CN': '/zh/webmcp' } },
}
export const dynamic = 'force-dynamic'
export default async function Page() { const { catalog, source } = await readCatalog(); return <WebMCPDirectory source={source} catalog={catalog} locale="zh" /> }
