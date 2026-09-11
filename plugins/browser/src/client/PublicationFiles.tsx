import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { FsListing } from '../publication-file-contracts.js'
import type { BrowserSite } from '../contracts.js'
import type { BrowserClientService } from './browser-api.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './publication-files.module.css'

export function PublicationFiles({ site, browser, t, draft, webmcp = false }: {
  site: BrowserSite; browser: BrowserClientService; draft?: string; webmcp?: boolean
} & PropsLocale<typeof BROWSER_LOCALE>) {
  const [root, setRoot] = useState<FsListing>()
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void browser.request<FsListing>(webmcp ? { action: 'site.webmcp.files', siteId: site.id } : draft ? { action: 'market.files.list', siteId: site.id, draft } : { action: 'site.files.list', siteId: site.id }, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        if (!value || typeof value.home !== 'string' || !Array.isArray(value.entries)) {
          throw new Error(t('filesInvalidResponse'))
        }
        setRoot(value)
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [site.id, browser, tick, draft, webmcp])
  const Files = browser.Files
  return <div className={css.files} aria-label={t('filesTitle')}>
    <header><strong>{t(webmcp ? 'filesWebmcp' : draft ? 'filesDraft' : 'filesWorkspace')}</strong><button aria-label={t('filesRefresh')} disabled={loading} onClick={() => setTick(value => value + 1)}>↻</button></header>
    {loading && <p role="status">{t('communityLoading')}</p>}
    {error && <p role="alert">{error}</p>}
    {root && Files && <Files site={site} root={root} refreshTick={tick} />}
    {root && !Files && <p role="status">{t('filesConnecting')}</p>}
    {root && <details className={css.path}><summary>{t('filesLocalPath')}</summary><code>{root.home}</code></details>}
  </div>
}
