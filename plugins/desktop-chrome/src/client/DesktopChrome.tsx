import type { ReactNode } from 'react'
import { IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PanelActions } from './service.ts'
import { NewSessionIcon } from './NewSessionIcon.tsx'
import css from './desktop-chrome.module.css'

interface DesktopChromeProps {
  sidebarCollapsed: boolean
  hasConversation: boolean
  sidebarWidth: number
  rightbarWidth?: number
  workspaceControl?: ReactNode
  actions: PanelActions
  startSession: () => void
}

const SIDEBAR_DRAG_START = 114

/** Native React controls that remain reachable when the sidebar is 0px. */
export function DesktopChrome({
  sidebarCollapsed,
  hasConversation,
  sidebarWidth,
  rightbarWidth = 0,
  workspaceControl,
  actions,
  startSession,
}: DesktopChromeProps) {
  return (
    <div
      className={css.chrome}
      data-deepdeck-desktop-chrome
      data-has-conversation={hasConversation || undefined}
    >
      <div
        className={css.dragRegion}
        data-has-conversation={hasConversation || undefined}
        style={hasConversation
          ? { width: Math.max(0, sidebarWidth - SIDEBAR_DRAG_START) }
          : { right: Math.max(rightbarWidth, workspaceControl ? 48 : 0) }}
        aria-hidden="true"
      />
      {workspaceControl && <div className={css.workspaceControl}>{workspaceControl}</div>}
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
          <IconPanelLeftOutlineRegular className={css.sidebarIcon} />
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
