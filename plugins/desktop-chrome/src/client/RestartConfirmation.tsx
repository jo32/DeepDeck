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
      description={t('restart.description')}
      closeLabel={t('restart.cancel')}
      className={css.restartDialog as string}
      onClose={() => { void decide(false) }}
      footer={(
        <div className={css.restartActions}>
          <Button variant="ghost" disabled={busy} onClick={() => { void decide(false) }}>
            {t('restart.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => { void decide(true) }}>
            {busy ? t('restart.restarting') : t('restart.confirm')}
          </Button>
        </div>
      )}
    >
      <div className={css.restartContent}>
        <ul>
          <li><strong>{continuingCount}</strong> {t('restart.runningSessions')}</li>
          {waitingCount > 0 && <li><strong>{waitingCount}</strong> {t('restart.waitingSessions')}</li>}
          <li><strong>{request.openAppCount}</strong> {t('restart.openApps')}</li>
        </ul>
        <p className={css.restartDurability}>{t('restart.durability')}</p>
        {failed && <p role="alert" className={css.restartError}>{t('restart.failed')}</p>}
      </div>
    </Modal>
  )
}
