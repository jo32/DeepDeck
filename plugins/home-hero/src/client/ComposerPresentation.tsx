import { createContext, type ReactNode } from 'react'

/** Presentation only: the session and its input machine retain their real phase. */
export const DockedComposerContext = createContext(false)

export function DockedComposer({ children }: { children: ReactNode }) {
  return <DockedComposerContext.Provider value={true}>{children}</DockedComposerContext.Provider>
}
