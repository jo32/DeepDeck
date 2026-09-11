'use client'

import { useState } from 'react'
import { WebMCPDirectory as Directory } from '../../../../plugins/browser/src/client/WebMCPDirectory'
import { packagePath, repositoryUrl } from '../../../../plugins/browser/src/webmcp-package'
import styles from './webmcp-submission.module.css'

interface Receipt { id: string; status: string; error?: string | null }
export function WebMCPDirectory({ catalog, locale, source }: { catalog: unknown; locale: 'en' | 'zh'; source: 'live' | 'bundled' }) {
  const zh = locale === 'zh'
  const [repository, setRepository] = useState('')
  const [manifestPath, setManifestPath] = useState('webmcp.json')
  const [receipt, setReceipt] = useState<Receipt>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(check = false) {
    setBusy(true); setError('')
    try {
      const response = await fetch(check && receipt ? `/api/webmcp/submissions?id=${encodeURIComponent(receipt.id)}` : '/api/webmcp/submissions', check ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository: repositoryUrl(repository.trim()), manifestPath: packagePath(manifestPath.trim()) }),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`)
      if (typeof value.id !== 'string' || typeof value.status !== 'string') throw new Error('Invalid index response')
      setReceipt(value)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <>
    {source === 'bundled' && <p className={styles.notice} role="status">{zh ? '实时目录暂不可用，正在显示随版本附带的目录。' : 'Live directory unavailable. Showing the bundled directory.'}</p>}
    <Directory catalog={catalog} locale={locale} submissionHref="#submit" />
    <section id="submit" className={styles.submission} aria-labelledby="submission-title">
      <h2 id="submission-title">{zh ? '提交 WebMCP 仓库' : 'Submit a WebMCP repository'}</h2>
      <p>{zh ? '粘贴公开 GitHub 仓库地址。校验通过后自动收录，并定期刷新。也可给仓库添加 webmcp topic，等待自动发现。' : 'Paste a public GitHub repository. The index validates it, lists it, and refreshes it periodically. Add the webmcp topic for automatic discovery too.'}</p>
      <form onSubmit={event => { event.preventDefault(); setReceipt(undefined); void submit() }}>
        <label>{zh ? 'GitHub 仓库' : 'GitHub repository'}<input type="url" required value={repository} maxLength={300} placeholder="https://github.com/owner/webmcp-project" onChange={event => setRepository(event.target.value)} /></label>
        <label>{zh ? 'Manifest 路径' : 'Manifest path'}<input required value={manifestPath} maxLength={240} onChange={event => setManifestPath(event.target.value)} /></label>
        <button disabled={busy}>{busy ? (zh ? '处理中…' : 'Working…') : (zh ? '提交索引' : 'Submit for indexing')}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {receipt && <div role="status">
        <p>{receipt.status === 'indexed' ? (zh ? '已收录。刷新目录即可查看。' : 'Indexed. Refresh the directory to see the project.') : receipt.status === 'failed' ? (zh ? '校验失败，修复仓库后服务将自动重试。' : 'Validation failed. Fix the repository; the service will retry.') : (zh ? '已提交，等待索引。通常需要几分钟。' : 'Submitted, awaiting indexing. This usually takes a few minutes.')}</p>
        {receipt.error && <p>{receipt.error}</p>}
        <button type="button" disabled={busy} onClick={() => void submit(true)}>{zh ? '检查状态' : 'Check status'}</button>
        {receipt.status === 'indexed' && <a href={zh ? '/zh/webmcp' : '/webmcp'}>{zh ? '刷新目录' : 'Refresh directory'}</a>}
      </div>}
      <p>{zh ? '需包含有效的 webmcp.json、明确的许可证和摘要匹配的源码。收录不代表功能验证，也不会改变仓库所有权。' : 'Requires a valid webmcp.json, an explicit license, and source matching its hash. Indexing is not functional verification or a transfer of ownership.'}</p>
    </section>
  </>
}
