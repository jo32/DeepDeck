import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BRAND } from './generated-brand.ts'
import { NewSessionIcon } from './NewSessionIcon.tsx'
import { DesktopUpdateControl } from './DesktopUpdateControl.tsx'
import css from './desktop-chrome.module.css'

export const DESKTOP_SIDEBAR_LOCALE = 'deepdeck.desktop.sidebar' as const

export const desktopSidebarZh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'update.available': '发现新版本',
  'update.download': '下载更新',
  'update.downloading': '正在下载',
  'update.downloaded': '更新已下载',
  'update.restarting': '下载完成，正在自动重启…',
  'update.retry': '重新下载',
  'update.failed': '下载失败，请重试。',
  'update.short': '更新',
  'update.open': '查看可用更新',
  'update.close': '关闭更新提示',
} as const

export const desktopSidebarEn = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'update.available': 'Update available',
  'update.download': 'Download update',
  'update.downloading': 'Downloading',
  'update.downloaded': 'Update downloaded',
  'update.restarting': 'Download complete. Restarting automatically…',
  'update.retry': 'Try download again',
  'update.failed': 'Download failed. Try again.',
  'update.short': 'Update',
  'update.open': 'View available update',
  'update.close': 'Close update prompt',
} satisfies Record<keyof typeof desktopSidebarZh, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.desktop.sidebar': keyof typeof desktopSidebarZh
  }
}

export interface DesktopSidebarInjected {
  startSession: (workspaceId?: WorkspaceId) => void
}

export type DesktopSidebarProps =
  & PropsRuntime<'sidebar'>
  & PropsRenderSlots<'sidebar.workspaces' | 'sidebar.settings' | 'sidebar.footer.action'>
  & PropsLocale<typeof DESKTOP_SIDEBAR_LOCALE>
  & DesktopSidebarInjected

/**
 * Wide-only sidebar shell. Folding is owned by AppFrame, so this component is
 * unmounted at 0px and never needs the upstream compact-rail state machine.
 */
export function DesktopSidebar({ renderSlot, startSession, t }: DesktopSidebarProps) {
  return (
    <div className={css.desktopSidebar} data-deepdeck-desktop-sidebar>
      <div className={css.sidebarLogoRow}>
        <button
          type="button"
          className={css.sidebarBrand}
          aria-label={t('session.new.label')}
          onClick={() => { startSession() }}
        >
          <img
            aria-hidden="true"
            className={css.sidebarBrandMark}
            data-deepdeck-brand-mark
            src={BRAND.markDataUrl}
          />
          <span className={css.sidebarBrandName} data-deepdeck-brand-name>
            {BRAND.name}
          </span>
          <span className={css.sidebarBrandAttribution} data-deepdeck-brand-attribution>
            {BRAND.attribution}
          </span>
        </button>
      </div>

      <button
        type="button"
        className={css.sidebarNewSession}
        aria-label={t('session.new.label')}
        onClick={() => { startSession() }}
      >
        <NewSessionIcon />
        <span>{t('session.new')}</span>
      </button>

      <div className={css.sidebarRegion}>
        {renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}
      </div>

      <div className={css.sidebarFoot}>
        <div>{renderSlot('sidebar.footer.action', { wide: true })}</div>
        <div className={css.sidebarSettingsRow}>
          <div className={css.sidebarSettingsSlot}>
            {renderSlot('sidebar.settings', { wide: true })}
          </div>
          <DesktopUpdateControl t={t} />
        </div>
      </div>
    </div>
  )
}
