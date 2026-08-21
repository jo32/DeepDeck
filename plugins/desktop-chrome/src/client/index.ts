import { resolveSlotLabel, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatStore, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PanelActions } from './service.ts'
import { AppFrame, type BrandCompositionLedger } from './AppFrame.tsx'
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
import {
  HiddenComposerStats,
  SESSION_METRICS_LOCALE,
  SessionMetricsPopover,
  sessionMetricsEn,
  sessionMetricsZh,
} from './SessionMetricsPopover.tsx'
import { installArchiveSessionContinuity } from './archive-session-continuity.ts'

export const inject = ['slots', 'theme', 'workspaces', 'sessions', 'locale']

const HOME_HERO_ENTRY_ID = 'deepdeck-home-hero'

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
  ctx.effect(
    () => installArchiveSessionContinuity(ctx),
    'deepdeck desktop: archived session continuity',
  )

  const layout = new DesktopLayoutController()
  const brandComposition: BrandCompositionLedger = {
    isReady: () => ctx.slots.entries('conversation.input.dock')
      .some(entry => entry.options.id === HOME_HERO_ENTRY_ID),
    subscribe: listener => ctx.slots.subscribe('conversation.input.dock', listener),
  }
  ctx.effect(() => ctx.locale.register(DESKTOP_SIDEBAR_LOCALE, {
    zh: desktopSidebarZh,
    en: desktopSidebarEn,
  }), 'deepdeck desktop: sidebar dictionaries')
  ctx.effect(() => ctx.locale.register(SESSION_METRICS_LOCALE, {
    zh: sessionMetricsZh,
    en: sessionMetricsEn,
  }), 'deepdeck desktop: session metrics dictionaries')

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
        return {
          startSession: () => { ctx.workspaces.startSession() },
          brandComposition,
        }
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

  // The stock strip is a list cell, so a lower-priority entry with the same
  // id shadows it without reaching into the upstream plugin's lifecycle.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'stats',
    priority: -100,
  }, HiddenComposerStats))

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'deepdeck-session-metrics',
    order: 100,
    locale: SESSION_METRICS_LOCALE,
  }, SessionMetricsPopover))
}
