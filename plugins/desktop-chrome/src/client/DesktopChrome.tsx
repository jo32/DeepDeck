import type { PanelActions } from './service.ts'
import { NewSessionIcon } from './NewSessionIcon.tsx'
import css from './desktop-chrome.module.css'

interface DesktopChromeProps {
  sidebarCollapsed: boolean
  hasConversation: boolean
  actions: PanelActions
  startSession: () => void
}

function SidebarIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
      <path d="M6 2.75v10.5" />
    </svg>
  )
}

/** Native React controls that remain reachable when the sidebar is 0px. */
export function DesktopChrome({ sidebarCollapsed, hasConversation, actions, startSession }: DesktopChromeProps) {
  return (
    <div
      className={css.chrome}
      data-openworkbuddy-desktop-chrome
      data-has-conversation={hasConversation || undefined}
    >
      <div
        className={css.controls}
        data-has-conversation={hasConversation || undefined}
      >
        <button
          type="button"
          className={css.button}
          aria-label={sidebarCollapsed ? '打开侧栏' : '收起侧栏'}
          aria-expanded={!sidebarCollapsed}
          onClick={() => { actions.toggleSidebar() }}
        >
          <SidebarIcon />
        </button>
        {sidebarCollapsed && (
          <button
            type="button"
            className={`${css.button} ${css.newSessionButton}`}
            aria-label="新建会话"
            onClick={startSession}
          >
            <NewSessionIcon />
          </button>
        )}
      </div>
    </div>
  )
}
