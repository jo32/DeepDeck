import { createContext, useContext, useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BrowserSelection } from '../native-contract.js'

type DockProps = PropsRuntime<'conversation.input.dock'>
export const BrowserPageSelectionContext = createContext<{
  selection: BrowserSelection | undefined
  apply(selection: BrowserSelection, input: DockProps['input'], actions: DockProps['inputActions']): void
} | undefined>(undefined)

export function selectionDraft(draft: string, selection: BrowserSelection): string {
  const quote = selection.text.replace(/\r\n?/g, '\n').split('\n').map(line => `> ${line}`).join('\n')
  return `${draft}${draft ? '\n\n' : ''}${selection.url}\n${quote}\n\n`
}

/** Insert through the existing input machine; never submit the excerpt automatically. */
export function BrowserPageSelection({ input, inputActions }: DockProps) {
  const context = useContext(BrowserPageSelectionContext)
  useEffect(() => {
    if (context?.selection && input.phase === 'plain') context.apply(context.selection, input, inputActions)
  }, [context, input, inputActions])
  return null
}
