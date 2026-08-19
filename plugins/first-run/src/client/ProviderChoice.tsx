import { useEffect, useRef, useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { configureDeepSeek, signInAndConfigureCodex } from './auth.ts'
import type { FirstRunKey } from './locales.ts'
import { hasUsableModelProvider } from './readiness.ts'
import css from './provider-choice.module.css'

export interface ProviderChoiceInjected {
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
  t: (key: FirstRunKey) => string
}

export type ProviderChoiceProps = PropsRuntime<'settings.onboarding'> & InjectFace<ProviderChoiceInjected>

const ignoreImplicitDismiss = (): void => {}

export function ProviderChoice({ api, complete, t }: ProviderChoiceProps) {
  const [state, setState] = useState<'loading' | 'choosing' | 'chatgpt-working' | 'deepseek' | 'deepseek-working'>('loading')
  const [error, setError] = useState<FirstRunKey | null>(null)
  const [key, setKey] = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    void hasUsableModelProvider(api).then((ready) => {
      if (!mounted.current) return
      if (ready) complete()
      else setState('choosing')
    }).catch(() => { complete() })
  }, [api, complete])

  useEffect(() => {
    if (state === 'loading') return
    const appRoot = document.getElementById('root')
    if (appRoot === null) return
    const previous = appRoot.inert
    appRoot.inert = true
    return () => { appRoot.inert = previous }
  }, [state])

  if (state === 'loading') return null

  const login = (): void => {
    setState('chatgpt-working')
    setError(null)
    void signInAndConfigureCodex(api).then((result) => {
      if (!mounted.current) return
      if (result === 'popup-blocked') {
        setError('popupBlocked')
        setState('choosing')
        return
      }
      complete()
    }).catch(() => {
      if (!mounted.current) return
      setError('loginFailed')
      setState('choosing')
    })
  }

  const saveDeepSeek = (): void => {
    const value = key.trim()
    if (value.length === 0) {
      setError('keyRequired')
      return
    }
    setState('deepseek-working')
    setError(null)
    void configureDeepSeek(api, value).then(() => {
      if (mounted.current) complete()
    }).catch(() => {
      if (!mounted.current) return
      setError('keySaveFailed')
      setState('deepseek')
    })
  }

  const busy = state === 'chatgpt-working' || state === 'deepseek-working'

  return (
    <Modal open title={t('title')} onClose={ignoreImplicitDismiss} headless className={css.dialog as string}>
      <div className={css.content}>
        <div className={css.heading}>
          <h2 tabIndex={-1}>{t('title')}</h2>
          <p>{t('description')}</p>
        </div>
        {state === 'deepseek' || state === 'deepseek-working' ? (
          <form className={css.keyForm} onSubmit={(event) => { event.preventDefault(); saveDeepSeek() }}>
            <label>
              <span>{t('deepseekKeyLabel')}</span>
              <input
                type="password"
                value={key}
                placeholder={t('deepseekKeyPlaceholder')}
                autoFocus
                autoComplete="off"
                disabled={busy}
                onChange={(event) => { setKey(event.currentTarget.value); setError(null) }}
              />
            </label>
            <div className={css.formActions}>
              <button type="button" className={css.secondary} disabled={busy} onClick={() => { setState('choosing'); setError(null) }}>
                {t('back')}
              </button>
              <button type="submit" className={css.primary} disabled={busy}>
                {state === 'deepseek-working' ? t('deepseekSaving') : t('deepseekSave')}
              </button>
            </div>
          </form>
        ) : <div className={css.options}>
          <section className={css.option}>
            <div>
              <h3>{t('chatgptTitle')}</h3>
              <p>{t('chatgptDescription')}</p>
            </div>
            <button type="button" className={css.secondary} disabled={busy} onClick={login}>
              {state === 'chatgpt-working' ? t('chatgptWorking') : t('chatgptAction')}
            </button>
          </section>
          <section className={css.option}>
            <div>
              <h3>{t('deepseekTitle')}</h3>
              <p>{t('deepseekDescription')}</p>
            </div>
            <button type="button" className={css.secondary} disabled={busy} onClick={() => { setState('deepseek'); setError(null) }}>
              {t('deepseekAction')}
            </button>
          </section>
        </div>}
        {error === null ? null : <p role="alert" className={css.error}>{t(error)}</p>}
      </div>
    </Modal>
  )
}
