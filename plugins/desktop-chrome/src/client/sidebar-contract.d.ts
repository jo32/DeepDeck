import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Sidebar geometry shared with each app navigation entry. */
export interface DesktopAppNavigationOwnerProps {
  readonly wide: boolean
  readonly closeApps: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Navigation entries contributed by installed desktop app plugins. */
    'sidebar.apps': {
      kind: 'list'
      scope: 'root'
      owner: DesktopAppNavigationOwnerProps
    }
  }
}
