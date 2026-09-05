import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BrowserMode } from '../contracts.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './browser-conversation.module.css'

export const BrowserConversationContext = createContext<{
  mode: BrowserMode
  t: PropsLocale<typeof BROWSER_LOCALE>['t']
  welcomeTarget: HTMLDivElement | null
} | undefined>(undefined)

/** The original session dock supplies the facts; the Browser owns the welcome's seat. */
export function BrowserEmptyConversation({ session }: PropsRuntime<'conversation.input.dock'>) {
  const context = useContext(BrowserConversationContext)
  if (!context?.welcomeTarget || session.openState !== 'open' || !session.blank || session.composerPhase !== 'blank') return null
  return createPortal(<div className={css.welcome} data-browser-chat-welcome="">
    <h3>{context.t(context.mode === 'builder' ? 'chatWelcomeBuilder' : 'chatWelcome')}</h3>
    <p>{context.t(context.mode === 'builder' ? 'chatWelcomeBuilderText' : 'chatWelcomeText')}</p>
  </div>, context.welcomeTarget)
}
