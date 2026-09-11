import { useEffect } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationStore } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Browser opens directly in Chat, including sessions last viewed in Trajectory. */
export function BrowserSessionHeader({ useStore, actions }: PropsStore<ConversationStore>) {
  const view = useStore(state => state.view)
  useEffect(() => {
    if (view !== 'chat') actions.setView('chat')
  }, [view, actions])
  return null
}
