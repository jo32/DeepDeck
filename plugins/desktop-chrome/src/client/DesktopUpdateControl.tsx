import { useEffect, useId, useRef, useState } from 'react'
import type { DesktopSidebarProps } from './DesktopSidebar.tsx'
import css from './desktop-chrome.module.css'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  version?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  message?: string
}

interface UpdatesBridge {
  get: () => Promise<UpdateStatus>
  download: () => Promise<UpdateStatus>
  onStatus: (listener: (status: UpdateStatus) => void) => () => void
}

function bridge(): UpdatesBridge | undefined {
  const desktopWindow = window as Window & {
    deepseekDesktop?: { updates?: UpdatesBridge }
  }
  return desktopWindow.deepseekDesktop?.updates
}

function updateIsVisible(status: UpdateStatus | undefined): status is UpdateStatus & { version: string } {
  if (!status?.version) return false
  return status.state === 'available'
    || status.state === 'downloading'
    || status.state === 'downloaded'
    || status.state === 'error'
}

function UpdateGlyph({ downloaded }: { downloaded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {downloaded
        ? <path d="m5.2 10.2 3 3.1 6.7-7" />
        : (
            <>
              <path d="M10 3.2v9.1" />
              <path d="m6.7 9.4 3.3 3.3 3.3-3.3" />
              <path d="M4 15.8h12" />
            </>
          )}
    </svg>
  )
}

export interface DesktopUpdateControlProps {
  t: DesktopSidebarProps['t']
}

export function DesktopUpdateControl({ t }: DesktopUpdateControlProps) {
  const [api] = useState(bridge)
  const panelId = useId()
  const previousState = useRef<UpdateState | undefined>(undefined)
  const [status, setStatus] = useState<UpdateStatus | undefined>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!api) return
    let active = true
    const accept = (next: UpdateStatus) => {
      if (!active) return
      setStatus(next)
      const newlyAvailable = next.state === 'available' && previousState.current !== 'available'
      if (newlyAvailable || next.state === 'downloading' || next.state === 'downloaded') setOpen(true)
      previousState.current = next.state
    }
    const remove = api.onStatus(accept)
    void api.get().then(accept).catch(() => {})
    return () => {
      active = false
      remove()
    }
  }, [api])

  if (!api || !updateIsVisible(status)) return null

  const percent = Math.round(Math.min(100, Math.max(0, status.percent ?? 0)))
  const downloading = status.state === 'downloading'
  const downloaded = status.state === 'downloaded'
  const failed = status.state === 'error'

  const download = async () => {
    setOpen(true)
    try {
      setStatus(await api.download())
    } catch {
      setStatus({ ...status, state: 'error' })
    }
  }
  return (
    <div className={css.updateAnchor}>
      {open && (
        <section id={panelId} className={css.updatePopover} aria-live="polite">
          <div className={css.updatePopoverHeader}>
            <div>
              <strong>{downloaded ? t('update.downloaded') : t('update.available')}</strong>
              <span>v{status.version}</span>
            </div>
            {!downloading && !downloaded && (
              <button
                type="button"
                className={css.updateClose}
                aria-label={t('update.close')}
                onClick={() => { setOpen(false) }}
              >
                ×
              </button>
            )}
          </div>

          {downloading && (
            <div className={css.updateProgressBlock}>
              <div className={css.updateProgressLabel}>
                <span>{t('update.downloading')}</span>
                <span>{percent}%</span>
              </div>
              <progress className={css.updateProgress} max={100} value={percent}>
                {percent}%
              </progress>
            </div>
          )}

          {failed && <p className={css.updateError}>{t('update.failed')}</p>}
          {downloaded && <p className={css.updateRestarting}>{t('update.restarting')}</p>}

          {!downloading && !downloaded && (
            <button
              type="button"
              className={css.updatePrimaryButton}
              onClick={() => { void download() }}
            >
              {failed ? t('update.retry') : t('update.download')}
            </button>
          )}
        </section>
      )}

      <button
        type="button"
        className={css.updateIconButton}
        aria-label={t('update.open')}
        aria-expanded={open}
        aria-controls={panelId}
        title={t('update.open')}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={css.updateIconGlyph}>
          <UpdateGlyph downloaded={downloaded} />
        </span>
        <span className={css.updateIconLabel}>{t('update.short')}</span>
      </button>
    </div>
  )
}
