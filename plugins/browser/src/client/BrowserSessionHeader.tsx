import { useEffect } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatStore } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Browser opens directly in Chat, including sessions last viewed in Trajectory. */
export function BrowserSessionHeader({ useStore, actions }: PropsStore<ChatStore>) {
  const view = useStore(state => state.view)
  useEffect(() => {
    if (view !== 'chat') actions.setView('chat')
  }, [view, actions])
  return null
}
