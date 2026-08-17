import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BRAND } from './generated-brand.ts'
import { NewSessionIcon } from './NewSessionIcon.tsx'
import css from './desktop-chrome.module.css'

export const DESKTOP_SIDEBAR_LOCALE = 'openworkbuddy.desktop.sidebar' as const

export const desktopSidebarZh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
} as const

export const desktopSidebarEn = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
} satisfies Record<keyof typeof desktopSidebarZh, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'openworkbuddy.desktop.sidebar': keyof typeof desktopSidebarZh
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
    <div className={css.desktopSidebar} data-openworkbuddy-desktop-sidebar>
      <div className={css.sidebarLogoRow}>
        <button
          type="button"
          className={css.sidebarBrand}
          aria-label={t('session.new.label')}
          onClick={() => { startSession() }}
        >
          <img className={css.sidebarWordmark} src={BRAND.wordmarkDataUrl} alt="" />
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
        <div>{renderSlot('sidebar.settings', { wide: true })}</div>
      </div>
    </div>
  )
}
