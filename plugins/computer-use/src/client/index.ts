import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  COMPUTER_USE_SETTINGS_NAMESPACE,
  type ComputerUseSettings,
} from '../contracts.ts'
import { ComputerUseSettingsRow } from './ComputerUseSettingsRow.tsx'
import { ComputerUseToggle, type ComputerUseInjected } from './ComputerUseToggle.tsx'
import { en, zh, type ComputerUseLocaleKey } from './locales.ts'

const LOCALE_NAMESPACE = 'deepdeck.computer-use'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.computer-use': ComputerUseLocaleKey
  }
}

export const inject = ['slots', 'locale', 'settingsScope']

/** Register one shared durable toggle in Settings and in the composer toolbar. */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'computer-use: dictionaries',
  )
  const scope = ctx.settingsScope.bind<ComputerUseSettings>({
    namespace: COMPUTER_USE_SETTINGS_NAMESPACE,
  })
  const injected = (): ComputerUseInjected => ({
    hooks: { computerUse: scope },
    setEnabled: enabled => scope.set('enabled', enabled),
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'computer-use',
    order: -10,
    locale: LOCALE_NAMESPACE,
    inject: injected,
  }, ComputerUseSettingsRow))

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'computer-use',
    order: -100,
    locale: LOCALE_NAMESPACE,
    inject: injected,
  }, ComputerUseToggle))
}
