import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  desktopRestartBridge,
  type RestartRequestSnapshot,
  type RestartSessionSnapshot,
} from './restart-runtime.ts'
import css from './desktop-chrome.module.css'

export type RestartConfirmationProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'deepdeck.desktop.sidebar'>

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 8.5A8 8 0 1 0 20 14" />
      <path d="M19 4.5v4h-4" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 5.5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H10l-3.5 2v-2h-2a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" />
      <path d="M6.5 9h7M6.5 11.5h4.5" />
    </svg>
  )
}

function AppsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.5" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.5" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.5" />
    </svg>
  )
}

function SafetyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.5 16 5v4.2c0 3.8-2.4 6.6-6 8.3-3.6-1.7-6-4.5-6-8.3V5l6-2.5Z" />
      <path d="m7.2 10 1.8 1.8 3.8-4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  )
}

export function RestartConfirmation({ useSessions, t }: RestartConfirmationProps) {
  const [api] = useState(desktopRestartBridge)
  const [request, setRequest] = useState<RestartRequestSnapshot | undefined>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sessions = useSessions(state => state)
  const restartSessions = useMemo<RestartSessionSnapshot[]>(() => (
    Object.values(sessions.byId)
      .filter(summary => summary.running === true && summary.origin !== 'subagent')
      .map(summary => ({
        sessionId: summary.id,
        continuation: summary.pendingInteraction === undefined,
      }))
  ), [sessions])

  useEffect(() => {
    if (api === undefined) return
    let active = true
    const accept = (next: RestartRequestSnapshot) => {
      if (!active) return
      setRequest(next)
      setBusy(false)
      setFailed(false)
    }
    const remove = api.onRestartRequested(accept)
    void api.pendingRestart().then((pending) => {
      if (pending !== undefined) accept(pending)
    }).catch(() => {})
    return () => {
      active = false
      remove()
    }
  }, [api])

  if (api === undefined || request === undefined) return null

  const waitingCount = restartSessions.filter(session => !session.continuation).length
  const continuingCount = restartSessions.length - waitingCount
  const decide = async (confirmed: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const accepted = await api.decideRestart({
        requestId: request.requestId,
        confirmed,
        sessions: confirmed ? restartSessions : [],
      })
      if (!accepted) throw new Error('restart decision was not accepted')
      if (!confirmed) setRequest(undefined)
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <Modal
      open
      title={t('restart.title')}
      closeLabel={t('restart.cancel')}
      className={css.restartDialog as string}
      onClose={() => { void decide(false) }}
      headless
    >
      <div className={css.restartSurface} data-busy={busy || undefined}>
        <header className={css.restartHeader}>
          <div className={css.restartHeading}>
            <span className={css.restartHeroIcon}><RestartIcon /></span>
            <div>
              <h2>{t('restart.title')}</h2>
              <p>{t('restart.description')}</p>
            </div>
          </div>
          <button
            type="button"
            className={css.restartClose}
            aria-label={t('restart.cancel')}
            disabled={busy}
            onClick={() => { void decide(false) }}
          >
            <CloseIcon />
          </button>
        </header>

        <div className={css.restartContent}>
          <div className={css.restartSummary} role="list">
            <div className={css.restartSummaryRow} role="listitem">
              <span className={css.restartSummaryIcon}><SessionsIcon /></span>
              <div className={css.restartSummaryCopy}>
                <span className={css.restartSummaryTitle}>{t('restart.sessionsLabel')}</span>
                <span className={css.restartSummaryDetail}>
                  <strong>{continuingCount}</strong> {t('restart.runningSessions')}
                  {waitingCount > 0 && (
                    <>
                      <span className={css.restartDot} aria-hidden="true">·</span>
                      <strong>{waitingCount}</strong> {t('restart.waitingSessions')}
                    </>
                  )}
                </span>
              </div>
              <span className={css.restartSummaryHint}>{t('restart.sessionsHint')}</span>
            </div>

            <div className={css.restartSummaryRow} role="listitem">
              <span className={css.restartSummaryIcon}><AppsIcon /></span>
              <div className={css.restartSummaryCopy}>
                <span className={css.restartSummaryTitle}>{t('restart.appsLabel')}</span>
                <span className={css.restartSummaryDetail}>
                  <strong>{request.openAppCount}</strong> {t('restart.openApps')}
                </span>
              </div>
              <span className={css.restartSummaryHint}>{t('restart.appsHint')}</span>
            </div>
          </div>

          <p className={css.restartDurability}>
            <span className={css.restartSafetyIcon}><SafetyIcon /></span>
            <span>{t('restart.durability')}</span>
          </p>
          {failed && <p role="alert" className={css.restartError}>{t('restart.failed')}</p>}
        </div>

        <footer className={css.restartActions}>
          <Button variant="outline" disabled={busy} onClick={() => { void decide(false) }}>
            {t('restart.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => { void decide(true) }}>
            {busy ? t('restart.restarting') : t('restart.confirm')}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
