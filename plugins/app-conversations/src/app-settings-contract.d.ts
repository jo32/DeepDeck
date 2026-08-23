import type {} from '@deepseek-ai/dsh-client-ui-slots'

export interface AppSettingsItemOwnerProps {
  readonly app: {
    readonly id: string
    readonly title: string
    readonly packageName: string
    readonly rebuildAvailable: boolean
    readonly rebuildReason?: string
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** App-owned settings content rendered inside its Apps settings card. */
    'settings.apps.item': {
      kind: 'list'
      scope: 'root'
      owner: AppSettingsItemOwnerProps
    }
  }
}
