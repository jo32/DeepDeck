import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'

/** Sidebar geometry shared with each app navigation entry. */
export interface DesktopAppNavigationOwnerProps {
  readonly wide: boolean
  readonly closeApps: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Top-level standalone window surfaces, contributed only in their own window. */
    'desktop.surface': {
      kind: 'single'
      scope: 'root'
      /** The root retains ownership of the canonical conversation outlet. */
      owner: { readonly renderConversation: () => ReactNode }
    }
    /** Standalone desktop capabilities displayed directly above Apps. */
    'sidebar.launchers': { kind: 'list'; scope: 'root'; owner: { readonly wide: boolean } }
    /** Navigation entries contributed by installed desktop app plugins. */
    'sidebar.apps': {
      kind: 'list'
      scope: 'root'
      owner: DesktopAppNavigationOwnerProps
    }
  }
}
