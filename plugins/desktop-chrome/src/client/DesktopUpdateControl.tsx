import { useEffect, useId, useRef, useState } from 'react'
import type { DesktopSidebarProps } from './DesktopSidebar.tsx'
import css from './desktop-chrome.module.css'

type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'updated'
  | 'error'

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
  install: () => Promise<UpdateStatus>
  onStatus: (listener: (status: UpdateStatus) => void) => () => void
}

const DISMISSED_UPDATED_VERSION_KEY = 'deepdeck.desktop.dismissed-updated-version'

function readDismissedUpdatedVersion(): string | undefined {
  try {
    return window.sessionStorage.getItem(DISMISSED_UPDATED_VERSION_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function rememberDismissedUpdatedVersion(version: string): void {
  try {
    window.sessionStorage.setItem(DISMISSED_UPDATED_VERSION_KEY, version)
  } catch {
    // The in-memory status is still cleared when session storage is unavailable.
  }
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
    || status.state === 'installing'
    || status.state === 'updated'
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
      if (next.state === 'updated' && next.version === readDismissedUpdatedVersion()) {
        setStatus(undefined)
        setOpen(false)
        previousState.current = next.state
        return
      }
      setStatus(next)
      const newlyAvailable = next.state === 'available' && previousState.current !== 'available'
      if (
        newlyAvailable
        || next.state === 'downloading'
        || next.state === 'downloaded'
        || next.state === 'installing'
        || next.state === 'updated'
        || next.state === 'error'
      ) setOpen(true)
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
  const installing = status.state === 'installing'
  const updated = status.state === 'updated'
  const failed = status.state === 'error'
  const heading = updated
    ? t('update.updated')
    : installing
      ? t('update.installing')
      : downloaded
        ? t('update.downloaded')
        : t('update.available')

  const close = () => {
    if (updated) {
      rememberDismissedUpdatedVersion(status.version)
      setStatus(undefined)
    }
    setOpen(false)
  }

  const download = async () => {
    setOpen(true)
    try {
      setStatus(await api.download())
    } catch {
      setStatus({ ...status, state: 'error' })
    }
  }
  const install = async () => {
    setStatus({ ...status, state: 'installing' })
    try {
      setStatus(await api.install())
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
              <strong>{heading}</strong>
              <span>v{status.version}</span>
            </div>
            {!downloading && !installing && (
              <button
                type="button"
                className={css.updateClose}
                aria-label={t('update.close')}
                onClick={close}
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
          {downloaded && <p className={css.updateDescription}>{t('update.readyDescription')}</p>}
          {installing && <p className={css.updateDescription}>{t('update.installingDescription')}</p>}
          {updated && <p className={css.updateDescription}>{t('update.updatedDescription')}</p>}

          {!downloading && !downloaded && !installing && !updated && (
            <button
              type="button"
              className={css.updatePrimaryButton}
              onClick={() => { void download() }}
            >
              {failed ? t('update.retry') : t('update.download')}
            </button>
          )}
          {downloaded && (
            <button
              type="button"
              className={css.updatePrimaryButton}
              onClick={() => { void install() }}
            >
              {t('update.install')}
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
          <UpdateGlyph downloaded={downloaded || installing || updated} />
        </span>
        <span className={css.updateIconLabel}>{t('update.short')}</span>
      </button>
    </div>
  )
}
