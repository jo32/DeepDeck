import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AppSettingsItemOwnerProps } from '@deepdeck/dsh-app-conversations/app-settings-contract'
import css from './HackerNewsAppSettings.module.css'

interface AccountState {
  readonly configured: boolean
  readonly username: string
  readonly verified: boolean
  readonly warning?: string
}

const API_PATH = '/api/hackernews-reader'

async function call(action: string, payload: Record<string, unknown> = {}): Promise<AccountState> {
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null) throw new Error('Hacker News returned an invalid response')
  const body = value as Record<string, unknown>
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${String(response.status)}`)
  return {
    configured: body.configured === true,
    username: typeof body.username === 'string' ? body.username : '',
    verified: body.verified === true,
    ...(typeof body.warning === 'string' ? { warning: body.warning } : {}),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function HackerNewsAppSettings(_props: AppSettingsItemOwnerProps): ReactNode {
  const [account, setAccount] = useState<AccountState>()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    void call('auth-status', { validate: true }).then(
      value => { if (active) setAccount(value) },
      cause => { if (active) setError(messageOf(cause)) },
    )
    return () => { active = false }
  }, [])

  const login = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    void call('login', { username: username.trim(), password }).then(
      value => {
        setAccount(value)
        setPassword('')
      },
      cause => {
        setPassword('')
        setError(messageOf(cause))
      },
    ).finally(() => { setBusy(false) })
  }

  const logout = (): void => {
    setBusy(true)
    setError(undefined)
    void call('logout').then(
      value => { setAccount(value) },
      cause => { setError(messageOf(cause)) },
    ).finally(() => { setBusy(false) })
  }

  if (account === undefined && error === undefined) return <p className={css.status}>Checking Hacker News account…</p>
  if (account?.configured === true) {
    return (
      <div className={css.account}>
        <div>
          <strong>@{account.username}</strong>
          <p>{account.verified ? 'Session verified' : (account.warning ?? 'Session stored')}</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={logout}>{busy ? 'Signing out…' : 'Sign out'}</Button>
        {error === undefined ? null : <p className={css.error} role="alert">{error}</p>}
      </div>
    )
  }
  return (
    <form className={css.form} onSubmit={login}>
      <label>
        <span>Username</span>
        <input
          value={username}
          autoComplete="username"
          required
          onChange={event => { setUsername(event.currentTarget.value) }}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={event => { setPassword(event.currentTarget.value) }}
        />
      </label>
      <Button variant="outline" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</Button>
      <p className={css.hint}>The password is sent once to Hacker News; DeepDeck stores only the returned session cookie.</p>
      {error === undefined ? null : <p className={css.error} role="alert">{error}</p>}
    </form>
  )
}
