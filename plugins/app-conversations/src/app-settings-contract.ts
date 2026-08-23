import type { AppSettingsDescriptor } from './contracts.js'

export interface AppSettingsItemOwnerProps {
  readonly app: AppSettingsDescriptor
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
