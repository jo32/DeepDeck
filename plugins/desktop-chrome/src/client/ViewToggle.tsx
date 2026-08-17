import { useSyncExternalStore } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatStore, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './desktop-chrome.module.css'

export interface ViewsLedger {
  list: () => readonly ViewTab[]
  subscribe: (listener: () => void) => () => void
  version: () => number
}

export interface ViewToggleInjected { views: ViewsLedger }

export type ViewToggleProps =
  & PropsRuntime<'conversation.session.header.actions'>
  & PropsStore<ChatStore>
  & ViewToggleInjected

function ChatIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3.25A1.25 1.25 0 0 1 3.25 2h9.5A1.25 1.25 0 0 1 14 3.25v6.5A1.25 1.25 0 0 1 12.75 11H8.8L6 13.5V11H3.25A1.25 1.25 0 0 1 2 9.75v-6.5Z" />
    </svg>
  )
}

function TrajectoryIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="3" cy="3" r="1" />
      <circle cx="3" cy="8" r="1" />
      <circle cx="3" cy="13" r="1" />
      <path d="M6 3h7M6 8h7M6 13h7" />
    </svg>
  )
}

/** One icon button cycles the active conversation view through the slot ring. */
export function ViewToggle({ useStore, actions, views }: ViewToggleProps) {
  useSyncExternalStore(views.subscribe, views.version)
  const tabs = views.list()
  const selectedId = useStore(state => state.view)
  if (tabs.length < 2) return null

  const activeIndex = Math.max(0, tabs.findIndex(tab => tab.id === (selectedId ?? 'chat')))
  const active = tabs[activeIndex]
  const next = tabs[(activeIndex + 1) % tabs.length]
  if (active === undefined || next === undefined) return null

  return (
    <button
      type="button"
      className={css.viewToggle}
      aria-label={`切换到${next.label}`}
      title={`切换到${next.label}`}
      onClick={() => { actions.setView(next.id) }}
    >
      {active.id === 'chat' ? <ChatIcon /> : <TrajectoryIcon />}
    </button>
  )
}
