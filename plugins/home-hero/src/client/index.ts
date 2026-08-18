import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { HomeHeroArtwork, type HomeHeroKey } from './HomeHeroArtwork.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    homeHero: HomeHeroKey
  }
}

const NS = 'homeHero'

const zh: Record<HomeHeroKey, string> = {
  characterLabel: 'Alien Orb 外星人圆球角色，眼睛会跟随鼠标，拖动角色可旋转',
}

const en: Record<HomeHeroKey, string> = {
  characterLabel: 'Alien Orb character; eyes follow the pointer and the character can be dragged to rotate',
}

export const inject = ['slots', 'locale']

/** Install the blank-session character through the declared input dock slot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'openworkbuddy home hero: dictionaries')

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'openworkbuddy-home-hero',
    order: -1000,
    locale: NS,
  }, HomeHeroArtwork))
}
