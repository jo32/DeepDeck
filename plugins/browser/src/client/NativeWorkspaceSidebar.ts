import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Context } from 'dsh-better-sidebar/src/context-types.ts'
import type { SidebarStore } from 'dsh-better-sidebar/src/client/state.ts'
import type { BetterSidebarService } from 'dsh-better-sidebar/src/client/service.ts'
import { registerNativeSurface } from 'dsh-better-sidebar/src/client/native/index.ts'
import { createNativeSurface } from 'dsh-better-sidebar/src/client/native/surface.ts'
import { createNativeTabRecords } from 'dsh-better-sidebar/src/client/native/tab-adapter.tsx'
import { BlankWorkspaceButton } from './BlankWorkspaceButton.js'
import { BROWSER_LOCALE } from './locales.js'

/** File links and plugin tools share Harness's one session sidebar. */
export function installNativeWorkspaceSidebar(ctx: ClientContext, store: SidebarStore, service: BetterSidebarService): void {
  const context = ctx as unknown as Context
  const t = ctx.locale.bind(BROWSER_LOCALE)
  ctx.slots.inject('desktop.workspace-toggle', () => ctx.slots.register({
    name: 'desktop.workspace-toggle',
    inject: () => ({ label: t('sidebarOpen'), open: () => {
      const sidebar = ctx.get('sidebarRight') as { isExpanded(): boolean; toggleExpanded(): void } | undefined
      if (sidebar && !sidebar.isExpanded()) sidebar.toggleExpanded()
    } }),
  }, BlankWorkspaceButton))
  ctx.effect(() => {
    const syncSession = () => store.setSession(ctx.sessions.list.getSnapshot().current)
    syncSession()
    const unsubscribe = ctx.sessions.list.subscribe(syncSession)
    const records = createNativeTabRecords()
    const surface = createNativeSurface(context, records)
    service.setSurface(surface)
    const unregister = registerNativeSurface({ ctx: context, store, service, records })
    return () => {
      unregister()
      service.setSurface(undefined)
      surface.dispose()
      unsubscribe()
    }
  }, 'deepdeck browser: native workspace sidebar')
}
