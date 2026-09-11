import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { FilesTarget } from '../publication-file-contracts.js'
import type { BrowserSite } from '../contracts.js'
import { type WebMCPCatalog, type WebMCPPreview } from '../webmcp-package.js'
import type { BrowserClientService } from './browser-api.js'
import { BROWSER_LOCALE } from './locales.js'
import { GitHubAuthor } from './GitHubAuthor.js'
import css from './community.module.css'

export function WebMCPCommunity({ site, browser, running, t, refresh, onOpenFiles, onPublish }: {
  site: BrowserSite; browser: BrowserClientService; running: boolean; refresh: () => Promise<void>; onOpenFiles: (target: FilesTarget) => void; onPublish: () => Promise<void>
} & PropsLocale<typeof BROWSER_LOCALE>) {
  const [repository, setRepository] = useState(site.provenance?.repository ?? '')
  const [path, setPath] = useState(site.provenance?.manifestPath ?? 'webmcp.json')
  const [commit, setCommit] = useState('')
  const [catalog, setCatalog] = useState<WebMCPCatalog & { source?: 'online' | 'bundled' }>()
  const [searchTick, setSearchTick] = useState(0)
  const [searching, setSearching] = useState(true)
  const [searchError, setSearchError] = useState('')
  const [preview, setPreview] = useState<WebMCPPreview>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(true)
  const operation = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setSearching(true); setSearchError(''); setCatalog(undefined)
    void browser.request<WebMCPCatalog & { source?: 'online' | 'bundled' }>({ action: 'market.catalog', origin: site.origin }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setCatalog(value) })
      .catch(failure => { if (!controller.signal.aborted) setSearchError(failure instanceof Error ? failure.message : String(failure)) })
      .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    return () => controller.abort()
  }, [site.origin, browser, searchTick])
  const perform = async (action: () => Promise<void>) => {
    if (operation.current) return
    operation.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { operation.current = false; if (mounted.current) setBusy(false) }
  }
  const inspect = (repo: string, manifestPath: string, revision?: string, repositoryId?: number) => perform(async () => {
    setPreview(undefined)
    const result = await browser.request<WebMCPPreview>({ action: 'market.preview', siteId: site.id, repository: repo, manifestPath, ...(revision ? { commit: revision } : {}), ...(repositoryId ? { repositoryId } : {}) })
    if (mounted.current) setPreview(result)
  })
  return <section className={css.community} aria-label={t('community')}>
    <div className={css.heading}><h3>{t('community')}</h3>
      <button disabled={searching} aria-label={t('communityRefresh')} onClick={() => setSearchTick(value => value + 1)}>↻ {t('communityRefresh')}</button>
    </div>
    <div aria-live="polite" aria-busy={searching}>
      {searching && <p>{t('communitySearching')}</p>}
      {searchError && <p role="alert">{searchError}</p>}
      {catalog && <>
        {catalog.source === 'bundled' && <p className={css.muted}>{t('communityBundled')}</p>}
        {catalog.entries.length === 0 && <p>{t(catalog.source === 'bundled' ? 'communityBundledEmpty' : 'communityEmpty')}</p>}
        {catalog.entries.map(entry => <article key={entry.id} className={css.entry}>
          <a href={entry.repository} target="_blank" rel="noreferrer">{entry.name}</a><p>{entry.description}</p>
          <GitHubAuthor author={entry.author} /><small>{entry.version ?? t('communityNoRelease')} · {entry.status}</small>
          {entry.syncError && <p role="status">{t('communityStale')}</p>}
          <button disabled={busy || entry.status !== 'active'} onClick={() => { const revision = entry.version ? undefined : entry.commit; setRepository(entry.repository); setPath(entry.manifestPath); setCommit(revision ?? ''); void inspect(entry.repository, entry.manifestPath, revision, entry.repositoryId) }}>{t('communityPreview')}</button>
        </article>)}
      </>}
    </div>
    <a href="/?deepdeck-surface=webmcp-market" target="_blank" rel="noreferrer">{t('communityWebsite')} ↗</a>
    {site.provenance && <div className={css.entry}>
      <strong>{t('communityInstalled')}</strong><GitHubAuthor author={site.provenance.author} />
      <a href={`${site.provenance.repository}/tree/${site.provenance.commit}`} target="_blank" rel="noreferrer">{site.provenance.repository.replace('https://github.com/', '')} · {site.provenance.version}</a>
      <code>{site.provenance.commit.slice(0, 12)}</code>
      <a href={`${site.provenance.repository}/issues`} target="_blank" rel="noreferrer">{t('communityIssues')}</a>
      <button disabled={busy} onClick={() => { void inspect(site.provenance!.repository, site.provenance!.manifestPath, undefined, site.provenance!.repositoryId) }}>{t('communityUpdates')}</button>
    </div>}
    <details><summary>{t('marketFromGithub')}</summary><form onSubmit={event => { event.preventDefault(); void inspect(repository.trim(), path.trim(), commit.trim()) }}>
      <label>{t('communityRepository')}<input required type="url" value={repository} placeholder="https://github.com/owner/repository" disabled={busy} onChange={event => { setRepository(event.target.value); setPreview(undefined) }} /></label>
      <details><summary>{t('communityAdvanced')}</summary>
        <label>{t('communityManifest')}<input value={path} required disabled={busy} onChange={event => { setPath(event.target.value); setPreview(undefined) }} /></label>
        <label>{t('communityCommit')}<input value={commit} pattern="[a-f0-9]{40}" disabled={busy} onChange={event => { setCommit(event.target.value); setPreview(undefined) }} /></label>
      </details>
      <button disabled={busy || !repository.trim()} type="submit">{busy ? t('communityLoading') : t('communityPreview')}</button>
    </form></details>
    {preview && <div className={css.preview}>
      <GitHubAuthor author={preview.provenance.author} /><h4>{preview.manifest.name} · {preview.manifest.version}</h4><p>{preview.manifest.description}</p>
      <p>{preview.manifest.origin} · {preview.manifest.license}</p>
      <a href={`${preview.provenance.repository}/tree/${preview.provenance.commit}`} target="_blank" rel="noreferrer"><code>{preview.provenance.commit}</code></a>
      <p>{preview.provenance.release ? t('communityStable') : t('communityCommitPreview')}</p>
      <ul>{preview.manifest.tools.map(tool => <li key={tool.name}><strong>{tool.name}</strong> — {tool.description}</li>)}</ul>
      <details><summary>{t('communitySource')}</summary><pre>{preview.source}</pre></details>
      <p>{t(preview.previousRevision ? 'communityReplace' : 'communityInstallNotice')}</p>
      {preview.hasDraft && <p>{t('communityDraftKept')}</p>}
      <p>{t('communityTrust')}</p>
      <div className={css.actions}>
        <button disabled={busy || running} onClick={() => { void perform(async () => {
          const token = preview.token; setPreview(undefined)
          await browser.request({ action: 'market.install', siteId: site.id, token })
          await refresh(); if (mounted.current) setNotice(t('communityActivated'))
        }) }}>{t(preview.previousRevision ? 'communityConfirmReplace' : 'communityInstall')}</button>
        <button disabled={busy} onClick={() => { setPreview(undefined) }}>{t('cancel')}</button>
      </div>
    </div>}
    {site.activeRevision && <div className={css.entry}>
      <strong>{t('communityPublish')}</strong><p>{t('communityPublishHint')}</p>
      <button disabled={busy || running} onClick={() => { void perform(async () => {
        const exported = await browser.request<{ directory: string }>({ action: 'market.export', siteId: site.id, revision: site.activeRevision! })
        if (mounted.current) { setNotice(t('communityExported')); onOpenFiles({ kind: 'draft', draft: exported.directory.split(/[\\/]/).pop()! }) }
      }) }}>{t('communityExport')}</button>
      {!site.provenance && !site.upstream && <button disabled={busy || running} onClick={() => { void perform(onPublish) }}>{t('communityPublishGithub')}</button>}
    </div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
