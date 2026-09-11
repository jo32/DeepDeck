import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { MARKET_MESSAGE, marketPackageRef, readMarketInstallLink } from '../market-link.js'
import { record, WEBMCP_MARKET_URL, type WebMCPPreview, type WebMCPCatalog } from '../webmcp-package.js'
import type { BrowserSite } from '../contracts.js'
import { browserRequest } from './browser-api.js'
import { GitHubAuthor } from './GitHubAuthor.js'
import { WebMCPDirectory } from './WebMCPDirectory.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './market.module.css'

type Prepared = { site: BrowserSite; preview: WebMCPPreview }
export function WebMCPMarket({ t, marketUrl }: PropsLocale<typeof BROWSER_LOCALE> & { marketUrl?: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const nonce = useRef(crypto.randomUUID())
  const busy = useRef(false)
  const alive = useRef(true)
  const [working, setWorking] = useState(false)
  const [prepared, setPrepared] = useState<Prepared>()
  const [installed, setInstalled] = useState<BrowserSite>()
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [retry, setRetry] = useState(0)
  const [frameFailed, setFrameFailed] = useState(false)
  const [directory, setDirectory] = useState<{ catalog: WebMCPCatalog; source: 'online' | 'bundled' }>()
  const [directoryError, setDirectoryError] = useState(false)
  const [repository, setRepository] = useState('')
  const [manifestPath, setManifestPath] = useState('webmcp.json')
  const [commit, setCommit] = useState('')
  const remote = !!marketUrl && !frameFailed
  const url = new URL(marketUrl ?? WEBMCP_MARKET_URL)
  if (t('marketLocale') === 'zh') url.pathname = '/zh/webmcp'
  url.searchParams.set('embed', 'deepdeck')
  const origin = url.origin
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true; setWorking(true); setError('')
    try { await action() } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { busy.current = false; if (alive.current) setWorking(false) }
  }
  const prepare = (input: unknown) => run(async () => {
    setPrepared(undefined); setInstalled(undefined)
    const ref = marketPackageRef(input)
    const result = await browserRequest<Prepared>({ action: 'market.prepare', ...ref })
    if (alive.current) setPrepared(result)
  })
  const connect = () => {
    setConnected(false)
    frame.current?.contentWindow?.postMessage({ type: `${MARKET_MESSAGE}.init`, nonce: nonce.current }, origin)
  }
  useEffect(() => {
    alive.current = true
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || !record(event.data) || event.data.nonce !== nonce.current) return
      if (event.data.type === `${MARKET_MESSAGE}.ready`) setConnected(true)
      if (event.data.type === `${MARKET_MESSAGE}.install` && !busy.current && !dialog.current?.open) void prepare(event.data.package)
    }
    window.addEventListener('message', listener)
    return () => { alive.current = false; window.removeEventListener('message', listener) }
  }, [origin])
  const initialLink = useRef(false)
  useEffect(() => {
    if (initialLink.current) return
    initialLink.current = true
    const link = new URLSearchParams(window.location.hash.slice(1)).get('install')
    if (link) {
      try { void prepare(readMarketInstallLink(link)) } catch (failure) { setError(String(failure)) }
    }
  }, [])
  useEffect(() => {
    if (prepared) dialog.current?.showModal()
    else dialog.current?.close()
  }, [prepared])
  useEffect(() => {
    if (connected || !remote) return
    // Next hydration may finish after the iframe load event.
    const timer = window.setInterval(() => frame.current?.contentWindow?.postMessage({ type: `${MARKET_MESSAGE}.init`, nonce: nonce.current }, origin), 1000)
    const deadline = window.setTimeout(() => setFrameFailed(true), 6000)
    return () => { window.clearInterval(timer); window.clearTimeout(deadline) }
  }, [connected, origin, retry, remote])
  useEffect(() => {
    if (remote) return
    const controller = new AbortController()
    setDirectoryError(false)
    void browserRequest<{ catalog: WebMCPCatalog; source: 'online' | 'bundled' }>({ action: 'market.directory' }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDirectory(value) })
      .catch(() => { if (!controller.signal.aborted) setDirectoryError(true) })
    return () => controller.abort()
  }, [remote, retry])
  return <section className={css.market} aria-label={t('marketTitle')}>
    <header><div><h2>{t('marketTitle')}</h2><p>{t('marketHint')}</p></div><button onClick={() => { setFrameFailed(false); setConnected(false); setRetry(value => value + 1) }}>{t('marketReload')}</button></header>
    {remote && !connected && <p role="status">{t('marketConnecting')}</p>}
    {working && <p role="status">{t('communityLoading')}</p>}
    {error && <p role="alert" className={css.error}>{error}</p>}
    {installed && <div className={css.success} role="status">{t('marketInstalled')} · {installed.origin}<button onClick={() => { void run(async () => { await browserRequest({ action: 'open', url: installed.origin }) }) }}>{t('marketOpenSite')}</button></div>}
    <details className={css.direct}><summary>{t('marketFromGithub')}</summary><form onSubmit={event => { event.preventDefault(); void prepare({ repository: repository.trim(), manifestPath: manifestPath.trim(), ...(commit.trim() ? { commit: commit.trim() } : {}) }) }}>
      <label>{t('communityRepository')}<input required type="url" value={repository} onChange={event => setRepository(event.target.value)} placeholder="https://github.com/owner/repository" /></label>
      <label>{t('communityManifest')}<input required value={manifestPath} onChange={event => setManifestPath(event.target.value)} /></label>
      <label>{t('communityCommit')}<input value={commit} pattern="[a-f0-9]{40}" onChange={event => setCommit(event.target.value)} /></label>
      <button disabled={working} type="submit">{t('communityPreview')}</button>
    </form></details>
    {!remote && directory?.source === 'bundled' && <p className={css.fallback} role="status">{t('marketBundled')}</p>}
    {!remote && directoryError && <p role="alert">{t('marketLoadError')}</p>}
    <div className={css.content}>
    {remote ? <iframe style={{ visibility: connected ? 'visible' : 'hidden' }} key={retry} ref={frame} title={t('marketTitle')} src={url.href} onLoad={connect} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" /> : directory ? <WebMCPDirectory catalog={directory.catalog} locale={t('marketLocale') === 'zh' ? 'zh' : 'en'} onInstall={value => { void prepare(value) }} /> : !directoryError && <p role="status">{t('communityLoading')}</p>}
    </div>
    <dialog ref={dialog} className={css.dialog} onCancel={event => { if (working) event.preventDefault(); else setPrepared(undefined) }}>
      {prepared && <><h2>{prepared.preview.manifest.name} · {prepared.preview.manifest.version}</h2><GitHubAuthor author={prepared.preview.provenance.author} /><p>{prepared.preview.manifest.description}</p>
        <p><strong>{prepared.site.origin}</strong> · {prepared.preview.manifest.license}</p>
        <a href={`${prepared.preview.provenance.repository}/tree/${prepared.preview.provenance.commit}`} target="_blank" rel="noreferrer"><code>{prepared.preview.provenance.commit}</code></a>
        <ul>{prepared.preview.manifest.tools.map(tool => <li key={tool.name}>{tool.name} — {tool.description}</li>)}</ul>
        <details><summary>{t('communitySource')}</summary><pre>{prepared.preview.source}</pre></details>
        <p>{t(prepared.preview.previousRevision ? 'communityReplace' : 'communityInstallNotice')}</p><p>{t('marketOpenNotice')}</p>
        {prepared.preview.hasDraft && <p>{t('communityDraftKept')}</p>}<p>{t('communityTrust')}</p>
        {error && <div><p role="alert" className={css.error}>{error}</p><button disabled={working} onClick={() => { void prepare(prepared.preview.provenance) }}>{t('communityPreview')}</button></div>}
        <footer><button disabled={working} onClick={() => { setPrepared(undefined) }}>{t('cancel')}</button><button className={css.primary} disabled={working} onClick={() => { void run(async () => {
          const result = await browserRequest<BrowserSite>({ action: 'market.install', siteId: prepared.site.id, token: prepared.preview.token, openSite: true })
          if (alive.current) { setInstalled(result); setPrepared(undefined) }
        }) }}>{working ? t('communityLoading') : t(prepared.preview.previousRevision ? 'communityConfirmReplace' : 'communityInstall')}</button></footer>
      </>}
    </dialog>
  </section>
}
