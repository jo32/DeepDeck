import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { BunBuilderSettingsTab } from './BunBuilderSettingsTab.js'
import { en, zh, type BunBuilderLocaleKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.bunBuilder': BunBuilderLocaleKey
  }
}

const NS = 'deepdeck.bunBuilder'
export const inject = ['slots', 'locale'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'deepdeck bun plugin builder: dictionaries')
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'deepdeck-bun-plugin-builder',
    order: 30,
    label: () => ctx.locale.bind(NS)('tab'),
    locale: NS,
  }, BunBuilderSettingsTab))
}
