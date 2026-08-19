import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { ProviderChoice } from './ProviderChoice.tsx'
import type { ProviderChoiceInjected } from './ProviderChoice.tsx'
import { en, zh, type FirstRunKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.first-run': FirstRunKey
  }
}

const NS = 'deepdeck.first-run'
export const inject = ['slots', 'locale', 'connection']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'deepdeck first run: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS) as ProviderChoiceInjected['t']
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'deepdeck-provider-choice',
    order: -50,
    locale: NS,
    inject: (): ProviderChoiceInjected => ({ api: connection.api, t }),
  }, ProviderChoice))
}
