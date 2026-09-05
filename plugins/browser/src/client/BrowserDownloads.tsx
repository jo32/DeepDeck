import type { BrowserDownload, BrowserNativeCommand } from '../native-contract.js'
import type { BrowserLocaleKey } from './locales.js'
import { BrowserIcon } from './icons.js'
import css from './browser.module.css'

export function downloadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const unit = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['', 'KB', 'MB', 'GB'][unit]}`
}
export function BrowserDownloads({ downloads, command, t }: {
  downloads: BrowserDownload[]
  command: (command: BrowserNativeCommand) => Promise<void>
  t: (key: BrowserLocaleKey) => string
}) {
  return <div className={css.panelScroll}>
    <div className={css.sectionHeading}><h3>{t('downloads')}</h3></div>
    {downloads.length === 0 && <div className={css.emptyTools}><BrowserIcon name="download" /><p>{t('noDownloads')}</p></div>}
    {downloads.map(download => {
      const status = download.paused ? 'downloadPaused' : download.state === 'completed' ? 'downloadCompleted'
        : download.state === 'cancelled' ? 'downloadCancelled' : download.state === 'interrupted' ? 'downloadInterrupted' : 'downloadProgressing'
      const control = (operation: Extract<BrowserNativeCommand, { action: 'download.control' }>['operation']) => {
        void command({ action: 'download.control', id: download.id, operation })
      }
      return <div className={css.download} key={download.id}><BrowserIcon name="download" /><div>
        <strong>{download.filename}</strong>
        <span>{t(status)} · {downloadSize(download.receivedBytes)}{download.totalBytes > 0 ? ` / ${downloadSize(download.totalBytes)}` : ''}</span>
        {download.state === 'progressing' && <progress aria-label={download.filename} value={download.totalBytes > 0 ? download.receivedBytes : undefined} max={download.totalBytes || 1} />}
        <div className={css.downloadActions}>
          {download.state === 'progressing' && !download.paused && <button type="button" onClick={() => { control('pause') }}>{t('pauseDownload')}</button>}
          {(download.paused || download.state === 'interrupted') && download.canResume && <button type="button" onClick={() => { control('resume') }}>{t('resumeDownload')}</button>}
          {(download.state === 'progressing' || download.state === 'interrupted' && download.canResume) && <button type="button" onClick={() => { control('cancel') }}>{t('cancel')}</button>}
          {download.state === 'completed' && <><button type="button" onClick={() => { control('open') }}>{t('openDownload')}</button><button type="button" onClick={() => { control('reveal') }}>{t('revealDownload')}</button></>}
        </div>
      </div></div>
    })}
  </div>
}
