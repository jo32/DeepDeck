import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { browserRequest } from './browser-api.js'
import { BROWSER_LOCALE } from './locales.js'
import { BrowserIcon } from './icons.js'
import css from './browser.module.css'

export function BrowserLauncher({ t }: PropsLocale<typeof BROWSER_LOCALE>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return <div className={css.launcherRow}>
    <button type="button" className={css.launcher} disabled={busy} aria-label={t('open')} onClick={() => {
      setBusy(true)
      setError(undefined)
      void browserRequest({ action: 'open' }).catch(failure => {
        setError(failure instanceof Error ? failure.message : String(failure))
      }).finally(() => { setBusy(false) })
    }}><BrowserIcon name="globe" /><span>{t('browser')}</span><span className={css.launcherHint}><BrowserIcon name="arrowUpRight" /></span></button>
    {error !== undefined && <p role="alert" className={css.launcherError}>{error}</p>}
  </div>
}
