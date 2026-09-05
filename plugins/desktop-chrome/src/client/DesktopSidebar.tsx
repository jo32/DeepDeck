import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DesktopAppNavigationOwnerProps } from './sidebar-contract.js'
import { BRAND } from './generated-brand.ts'
import { NewSessionIcon } from './NewSessionIcon.tsx'
import { DesktopUpdateControl } from './DesktopUpdateControl.tsx'
import { trackDesktopScreen } from './desktop-runtime.ts'
import css from './desktop-chrome.module.css'

export const DESKTOP_SIDEBAR_LOCALE = 'deepdeck.desktop.sidebar' as const

export const desktopSidebarZh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'apps.section': '应用',
  'apps.open': '打开应用列表',
  'apps.close': '关闭应用列表',
  'update.available': '发现新版本',
  'update.download': '下载更新',
  'update.downloading': '正在下载',
  'update.downloaded': '更新已就绪',
  'update.readyDescription': '更新将在重启后安装，DeepDeck 会自动重新打开。',
  'update.install': '重启并更新',
  'update.installing': '正在安装更新',
  'update.installingDescription': 'DeepDeck 即将退出，安装窗口会持续显示进度。',
  'update.updated': '已完成更新',
  'update.updatedDescription': 'DeepDeck 已更新到最新版本。',
  'update.retry': '重新下载',
  'update.failed': '更新未完成，请重试。',
  'update.short': '更新',
  'update.open': '查看可用更新',
  'update.close': '关闭更新提示',
  'restart.title': '重启 DeepDeck？',
  'restart.description': 'DeepDeck 将短暂退出，随后恢复你当前的工作。',
  'restart.sessionsLabel': '会话',
  'restart.runningSessions': '正在运行',
  'restart.waitingSessions': '等待处理',
  'restart.sessionsHint': '重启后恢复原状态',
  'restart.appsLabel': '应用',
  'restart.openApps': '当前打开',
  'restart.appsHint': '重启后自动重新打开',
  'restart.durability': '排队中的消息和待处理内容不会丢失',
  'restart.cancel': '暂不重启',
  'restart.confirm': '确认重启',
  'restart.restarting': '正在重启…',
  'restart.failed': '未能提交重启选择，请重试。',
} as const

export const desktopSidebarEn = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'apps.section': 'Apps',
  'apps.open': 'Open Apps',
  'apps.close': 'Close Apps',
  'update.available': 'Update available',
  'update.download': 'Download update',
  'update.downloading': 'Downloading',
  'update.downloaded': 'Update ready',
  'update.readyDescription': 'The update will install after restart, then DeepDeck will reopen automatically.',
  'update.install': 'Restart and update',
  'update.installing': 'Installing update',
  'update.installingDescription': 'DeepDeck will quit now. The installer window will keep showing progress.',
  'update.updated': 'Update complete',
  'update.updatedDescription': 'DeepDeck is now up to date.',
  'update.retry': 'Try download again',
  'update.failed': 'The update did not finish. Try again.',
  'update.short': 'Update',
  'update.open': 'View available update',
  'update.close': 'Close update prompt',
  'restart.title': 'Restart DeepDeck?',
  'restart.description': 'DeepDeck will briefly close, then return you to where you left off.',
  'restart.sessionsLabel': 'Sessions',
  'restart.runningSessions': 'running',
  'restart.waitingSessions': 'awaiting input',
  'restart.sessionsHint': 'Restore after restart',
  'restart.appsLabel': 'Apps',
  'restart.openApps': 'open',
  'restart.appsHint': 'Reopen automatically',
  'restart.durability': 'Queued messages and pending work stay safe.',
  'restart.cancel': 'Not now',
  'restart.confirm': 'Restart',
  'restart.restarting': 'Restarting…',
  'restart.failed': 'The restart choice could not be submitted. Try again.',
} satisfies Record<keyof typeof desktopSidebarZh, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.desktop.sidebar': keyof typeof desktopSidebarZh
  }
}

/** Observable view of the app capability slot used to hide an empty launcher. */
export interface DesktopAppsLedger {
  count: () => number
  subscribe: (listener: () => void) => () => void
  version: () => number
}

export interface DesktopSidebarInjected {
  startSession: (workspaceId?: WorkspaceId) => void
  apps: DesktopAppsLedger
}

export type DesktopSidebarProps =
  & PropsRuntime<'sidebar'>
  & PropsRenderSlots<
    'sidebar.workspaces' | 'sidebar.apps' | 'sidebar.settings' | 'sidebar.footer.action' | 'sidebar.launchers'
  >
  & PropsLocale<typeof DESKTOP_SIDEBAR_LOCALE>
  & DesktopSidebarInjected

function AppsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="4.5" height="4.5" rx="1" />
      <rect x="9.5" y="2" width="4.5" height="4.5" rx="1" />
      <rect x="2" y="9.5" width="4.5" height="4.5" rx="1" />
      <rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1" />
    </svg>
  )
}

/**
 * Wide-only sidebar shell. Folding is owned by AppFrame, so this component is
 * unmounted at 0px and never needs the upstream compact-rail state machine.
 */
export function DesktopSidebar({ renderSlot, startSession, apps, t }: DesktopSidebarProps) {
  useSyncExternalStore(apps.subscribe, apps.version, apps.version)
  const appCount = apps.count()
  const hasApps = appCount > 0
  const [appsOpen, setAppsOpen] = useState(false)
  const appsTitleId = useId()

  useEffect(() => {
    if (!hasApps) setAppsOpen(false)
  }, [hasApps])

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
        {renderSlot('sidebar.launchers', { wide: true })}
        {hasApps && (
          <div className={css.sidebarAppsLauncherRow}>
            <button
              type="button"
              className={css.sidebarAppsLauncher}
              aria-label={t('apps.open')}
              aria-haspopup="dialog"
              aria-expanded={appsOpen}
              onClick={() => {
                trackDesktopScreen('apps')
                setAppsOpen(true)
              }}
            >
              <AppsIcon />
              <span>{t('apps.section')}</span>
              <span className={css.sidebarAppsCount} aria-hidden="true">{appCount}</span>
            </button>
          </div>
        )}
        <div>{renderSlot('sidebar.footer.action', { wide: true })}</div>
        <div className={css.sidebarSettingsRow}>
          <div className={css.sidebarSettingsSlot}>
            {renderSlot('sidebar.settings', { wide: true })}
          </div>
          <DesktopUpdateControl t={t} />
        </div>
      </div>

      {hasApps && appsOpen && (
        <div
          className={css.sidebarAppsOverlay}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setAppsOpen(false)
          }}
        >
          <button
            type="button"
            className={css.sidebarAppsOverlayMask}
            aria-label={t('apps.close')}
            onClick={() => { setAppsOpen(false) }}
          />
          <section
            className={css.sidebarAppsPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={appsTitleId}
          >
            <header className={css.sidebarAppsPanelHeader}>
              <h2 id={appsTitleId}>{t('apps.section')}</h2>
              <button
                type="button"
                className={css.sidebarAppsClose}
                aria-label={t('apps.close')}
                autoFocus
                onClick={() => { setAppsOpen(false) }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <nav className={css.sidebarAppsList} aria-label={t('apps.section')}>
              {renderSlot('sidebar.apps', {
                wide: true,
                closeApps: () => { setAppsOpen(false) },
              })}
            </nav>
          </section>
        </div>
      )}
    </div>
  )
}
