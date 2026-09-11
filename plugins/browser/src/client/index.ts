import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepdeck/dsh-client-ui-desktop-chrome/sidebar-contract'
import { BROWSER_SURFACE } from '../contracts.js'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createWorkspaceFiles } from './WorkspaceFiles.js'
import { WebMCPMarket } from './WebMCPMarket.js'
import { BrowserFrame } from './BrowserFrame.js'
import { createBrowserClient } from './browser-api.js'
import { BROWSER_LOCALE, en, zh, type BrowserLocaleKey } from './locales.js'
import { BrowserLauncher } from './BrowserLauncher.js'
import type { ConversationStore } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BrowserSessionHeader } from './BrowserSessionHeader.js'
import { BrowserEmptyConversation } from './BrowserConversation.js'
import { BrowserPageSelection } from './BrowserPageSelection.js'
import { installComposerOverflow } from './composer-overflow.js'
import { BROWSER_THEME } from './browser-theme.js'
import type { DeepDeckCharacterService } from '@deepdeck/dsh-client-ui-home-hero/character-contract'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'deepdeck.browser': BrowserLocaleKey }
}


export const inject = ['remote', 'uiWorkspace', 'slots', 'sessions', 'workspaces', 'connection', 'locale', 'theme', 'deepdeckCharacter', 'modules'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(BROWSER_LOCALE, { en, zh }), 'deepdeck browser: dictionaries')
  ctx.slots.inject('sidebar.launchers', () => ctx.slots.register({
    name: 'sidebar.launchers', id: 'deepdeck-browser', order: 0, locale: BROWSER_LOCALE,
  }, BrowserLauncher))

  const t = ctx.locale.bind(BROWSER_LOCALE)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'webmcp-market', order: 13,
    label: () => t('marketTitle'), locale: BROWSER_LOCALE,
  }, WebMCPMarket))
  const surface = new URL(window.location.href).searchParams.get('deepdeck-surface')
  if (surface === 'webmcp-market') {
    ctx.slots.inject('desktop.surface', () => ctx.slots.register({ name: 'desktop.surface', locale: BROWSER_LOCALE }, WebMCPMarket))
    return
  }
  if (surface !== BROWSER_SURFACE) {
    if (surface === null) createWorkspaceFiles(ctx, { desktop: true })
    return
  }
  ctx.effect(() => ctx.theme.overrideTokens('@deepdeck/dsh-browser', BROWSER_THEME), 'deepdeck browser: neutral palette')
  const character = ctx.get('deepdeckCharacter') as DeepDeckCharacterService
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -100,
  }, character.Icon))
  const browser = createBrowserClient(ctx)
  browser.Files = createWorkspaceFiles(ctx)
  installComposerOverflow(ctx)
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'deepdeck-browser-welcome', order: -1001,
  }, BrowserEmptyConversation))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'deepdeck-browser-selection', order: -1002,
  }, BrowserPageSelection))
  ctx.slots.inject('conversation.session.header.actions', () => {
    const store = ctx.slots.entries('conversation.session.header').find(entry => entry.store !== undefined)?.store as ConversationStore | undefined
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
