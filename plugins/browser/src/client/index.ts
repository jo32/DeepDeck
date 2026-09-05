import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepdeck/dsh-client-ui-desktop-chrome/sidebar-contract'
import { BROWSER_SURFACE } from '../contracts.js'
import { BrowserFrame } from './BrowserFrame.js'
import { createBrowserClient } from './browser-api.js'
import { BROWSER_LOCALE, en, zh, type BrowserLocaleKey } from './locales.js'
import { BrowserLauncher } from './BrowserLauncher.js'
import type { ChatStore } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BrowserSessionHeader } from './BrowserSessionHeader.js'
import { BrowserEmptyConversation } from './BrowserConversation.js'
import { BrowserPageSelection } from './BrowserPageSelection.js'
import { installComposerOverflow } from './composer-overflow.js'
import { BROWSER_THEME } from './browser-theme.js'
import type { DeepDeckCharacterService } from '@deepdeck/dsh-client-ui-home-hero/character-contract'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'deepdeck.browser': BrowserLocaleKey }
}


export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'locale', 'theme', 'deepdeckCharacter'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(BROWSER_LOCALE, { en, zh }), 'deepdeck browser: dictionaries')
  ctx.slots.inject('sidebar.launchers', () => ctx.slots.register({
    name: 'sidebar.launchers', id: 'deepdeck-browser', order: 0, locale: BROWSER_LOCALE,
  }, BrowserLauncher))

  if (new URL(window.location.href).searchParams.get('deepdeck-surface') !== BROWSER_SURFACE) return
  ctx.effect(() => ctx.theme.overrideTokens('@deepdeck/dsh-browser', BROWSER_THEME), 'deepdeck browser: neutral palette')
  const character = ctx.get('deepdeckCharacter') as DeepDeckCharacterService
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -100,
  }, character.Icon))
  const browser = createBrowserClient(ctx)
  installComposerOverflow(ctx)
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'deepdeck-browser-welcome', order: -1001,
  }, BrowserEmptyConversation))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'deepdeck-browser-selection', order: -1002,
  }, BrowserPageSelection))
  ctx.slots.inject('conversation.session.header.actions', () => {
    const store = ctx.slots.entries('conversation.session.header').find(entry => entry.store !== undefined)?.store as ChatStore | undefined
    if (!store) throw new Error('Browser requires the shared conversation view store.')
    return ctx.slots.register({
      name: 'conversation.session.header', priority: -100, store,
    }, BrowserSessionHeader)
  })
  ctx.slots.inject('desktop.surface', () => ctx.slots.register({
    name: 'desktop.surface', locale: BROWSER_LOCALE,
    inject: () => ({ browser, character }),
  }, BrowserFrame))
}
