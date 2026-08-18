import { resolveSlotLabel, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatStore, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PanelActions } from './service.ts'
import { AppFrame } from './AppFrame.tsx'
import {
  DESKTOP_SIDEBAR_LOCALE,
  DesktopSidebar,
  desktopSidebarEn,
  desktopSidebarZh,
} from './DesktopSidebar.tsx'
import { createLayoutStore } from './stores.ts'
import { DesktopLayoutController } from './service.ts'
import { ThemePresenter } from './theme-presenter.ts'
import { ViewToggle, type ViewsLedger } from './ViewToggle.tsx'
import { installBranding } from './branding.ts'

export const inject = ['slots', 'theme', 'workspaces', 'locale']

function chatStoreFromHeader(entries: readonly StoredEntry[]): ChatStore {
  const entry = entries.find(candidate => candidate.store !== undefined)
  if (entry?.store === undefined) {
    throw new Error('desktop chrome: conversation header did not expose its shared chat store')
  }
  return entry.store as ChatStore
}

/** Install the branded desktop shell through declared Cordis lifecycle and Slot APIs. */
export function apply(ctx: ClientContext): void {
  installBranding(ctx)

  const layout = new DesktopLayoutController()
  ctx.effect(() => ctx.locale.register(DESKTOP_SIDEBAR_LOCALE, {
    zh: desktopSidebarZh,
    en: desktopSidebarEn,
  }), 'deepdeck desktop: sidebar dictionaries')

  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        sidebar: { kind: 'single', scope: 'root' },
        conversation: { kind: 'single', scope: 'session-maybe' },
        details: { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      store: createLayoutStore,
      inject: (actions: PanelActions) => {
        layout.attachPanels(actions)
        return { startSession: () => { ctx.workspaces.startSession() } }
      },
    }, AppFrame)
    return () => {
      disposeRegistration()
      void disposeService()
    }
  }, 'deepdeck desktop: layout service + root')

  ctx.effect(() => ctx.slots.register({
    name: 'sidebar',
    locale: DESKTOP_SIDEBAR_LOCALE,
    children: {
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: () => ({
      startSession: (workspaceId) => { ctx.workspaces.startSession(workspaceId) },
    }),
  }, DesktopSidebar), 'deepdeck desktop: wide-only sidebar shell')

  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', snapshot => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'deepdeck desktop: theme presenter')

  const views: ViewsLedger = {
    list: (): readonly ViewTab[] => ctx.slots.entries('conversation.view').flatMap((entry) => {
      const id = entry.options.id
      if (id === undefined) return []
      return [{ id, label: resolveSlotLabel(entry.options.label) ?? id }]
    }),
    subscribe: listener => ctx.slots.subscribe('conversation.view', listener),
    version: () => ctx.slots.getVersion('conversation.view'),
  }

  ctx.slots.inject('conversation.session.header.actions', () => {
    const chatStore = chatStoreFromHeader(ctx.slots.entries('conversation.session.header'))
    return ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'deepdeck-view-toggle',
      order: -100,
      store: chatStore,
      inject: () => ({ views }),
    }, ViewToggle)
  })
}
