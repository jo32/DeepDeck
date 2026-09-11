import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { resolveSlotLabel, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConversationStore, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PanelActions } from './service.ts'
import { AppFrame } from './AppFrame.tsx'
import { BrandCompositionController } from './brand-composition.ts'
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
import { trackDesktopScreen } from './desktop-runtime.ts'
import { installDesktopSettingsShell } from './settings-shell.tsx'
import { installDesktopQuestions } from './DesktopQuestionComposer.tsx'
import { RestartConfirmation } from './RestartConfirmation.tsx'
import { installRestartContinuity, type RestartContinuityRuntime } from './restart-continuity.ts'

export const inject = ['remote', 'slots', 'theme', 'workspaces', 'sessions', 'locale', 'connection', 'settingsScope']

function chatStoreFromHeader(entries: readonly StoredEntry[]): ConversationStore {
  const entry = entries.find(candidate => candidate.store !== undefined)
  if (entry?.store === undefined) {
    throw new Error('desktop chrome: conversation header did not expose its shared chat store')
  }
  return entry.store as ConversationStore
}

/** Install the branded desktop shell through declared Cordis lifecycle and Slot APIs. */
export function apply(ctx: ClientContext): void {
  // ui-workspace depends on layout, so resolve navigation after this provider mounts.
  const startSession = (workspaceId?: Parameters<ClientContext['uiWorkspace']['startSession']>[0]) => {
    const workspace = ctx.get('uiWorkspace')
    if (!workspace) throw new Error('Workspace navigation is not ready')
    workspace.startSession(workspaceId)
  }
  trackDesktopScreen('home')
  installBranding(ctx)
  ctx.effect(
    () => installArchiveSessionContinuity({ sessions: ctx.sessions, workspaces: ctx.workspaces, uiWorkspace: { startSession } }),
    'deepdeck desktop: archived session continuity',
  )
  ctx.effect(() => installRestartContinuity({ sessions: ctx.sessions, remote: ctx.remote }),
    'deepdeck desktop: restart session continuity')

  const layout = new DesktopLayoutController(id => ctx.slots.entries('main').some(entry => entry.options.key === id))
  const brandComposition = new BrandCompositionController()
  const apps = {
    count: () => ctx.slots.entries('sidebar.apps').length,
    subscribe: (listener: () => void) => ctx.slots.subscribe('sidebar.apps', listener),
    version: () => ctx.slots.getVersion('sidebar.apps'),
  }
  const surfaces = {
    count: () => ctx.slots.entries('desktop.surface').length,
    subscribe: (listener: () => void) => ctx.slots.subscribe('desktop.surface', listener),
    version: () => ctx.slots.getVersion('desktop.surface'),
  }
  ctx.effect(() => ctx.locale.register(DESKTOP_SIDEBAR_LOCALE, {
    zh: desktopSidebarZh,
    en: desktopSidebarEn,
  }), 'deepdeck desktop: sidebar dictionaries')
  ctx.effect(() => ctx.locale.register(SESSION_METRICS_LOCALE, {
    zh: sessionMetricsZh,
    en: sessionMetricsEn,
  }), 'deepdeck desktop: session metrics dictionaries')
  ctx.effect(
    () => ctx.reflect.provide('deepdeckBrandComposition', brandComposition),
    'deepdeck desktop: branded frame readiness',
  )

  ctx.effect(() => {
    const handle = createLayoutStore()
    const instance = handle.create()
    const store = { ...handle, create: () => instance }
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: { getSnapshot: () => instance.getSnapshot().panelInfo, subscribe: listener => instance.subscribe(listener) } } })
    layout.attachPanels(instance.actions)
    const retainMainPanel = () => {
      const selected = instance.getSnapshot().panelInfo.activePanelId
      if (selected !== null && !ctx.slots.entries('main').some(entry => entry.options.key === selected)) instance.actions.selectPanel(null)
    }
    const disposeMainPanels = ctx.slots.subscribe('main', retainMainPanel)
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        sidebar: { kind: 'single', scope: 'root' },
        main: { kind: 'keyed', scope: 'root' },
        rightbar: { kind: 'single', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'desktop.surface': { kind: 'single', scope: 'root' },
        'desktop.workbench': { kind: 'single', scope: 'root' },
      },
      store,
      inject: (actions: PanelActions) => {
        layout.attachPanels(actions)
        return {
          startSession: () => { startSession() },
          brandComposition,
          surfaces,
        }
      },
    }, AppFrame)
    return () => {
      disposeRegistration()
      disposePanelInfo()
      disposeMainPanels()
      layout.dispose()
      void disposeService()
    }
  }, 'deepdeck desktop: layout service + root')

  ctx.effect(() => ctx.slots.register({
    name: 'sidebar',
    locale: DESKTOP_SIDEBAR_LOCALE,
    children: {
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.apps': { kind: 'list', scope: 'root' },
      'sidebar.launchers': { kind: 'list', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: () => ({
      startSession,
      apps,
    }),
  }, DesktopSidebar), 'deepdeck desktop: wide-only sidebar shell')

  installDesktopSettingsShell(ctx)
  installDesktopQuestions(ctx)

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

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'deepdeck-restart-confirmation',
    order: 100,
    locale: DESKTOP_SIDEBAR_LOCALE,
  }, RestartConfirmation))
}
