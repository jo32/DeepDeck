import { useState } from 'react'
import type { BrowserAuthentication as Challenge, BrowserNativeCommand } from '../native-contract.js'
import type { BrowserLocaleKey } from './locales.js'
import css from './browser.module.css'

/** Credentials only live in this prompt until Chromium consumes the reply. */
export function BrowserAuthentication({ challenge, command, t }: {
  challenge: Challenge; command: (command: BrowserNativeCommand) => Promise<void>; t: (key: BrowserLocaleKey) => string
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const respond = (submit: boolean) => {
    setBusy(true)
    const credentials = { username, password }
    setPassword('')
    void command({ action: 'auth.respond', id: challenge.id, ...(submit ? { credentials } : {}) }).finally(() => { setBusy(false) })
  }
  return <form className={css.authentication} aria-label={t('signIn')} onSubmit={event => { event.preventDefault(); respond(true) }}>
    <div><strong>{t(challenge.isProxy ? 'proxySignIn' : 'signIn')}</strong><span>{challenge.host}{challenge.realm ? ` · ${challenge.realm}` : ''}</span></div>
    <input autoFocus aria-label={t('username')} placeholder={t('username')} autoComplete="username" value={username} onChange={event => { setUsername(event.target.value) }} disabled={busy} />
    <input type="password" aria-label={t('password')} placeholder={t('password')} autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value) }} disabled={busy} />
    <button type="submit" disabled={busy}>{t('signIn')}</button><button type="button" disabled={busy} onClick={() => { respond(false) }}>{t('cancel')}</button>
  </form>
}
