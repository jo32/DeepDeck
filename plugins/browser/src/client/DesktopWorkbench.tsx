import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { createElement, useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Context } from 'dsh-better-sidebar/src/context-types.ts'
import { allLeaves, openTabInBottomPane, toggleExpanded, toggleBottomPanel, type SidebarStore } from 'dsh-better-sidebar/src/client/state.ts'
import type { DesktopWorkbenchOwnerProps } from '@deepdeck/dsh-client-ui-desktop-chrome/sidebar-contract'
import type { BetterSidebarService } from 'dsh-better-sidebar/src/client/service.ts'
import { RenderBoundary } from 'dsh-better-sidebar/src/client/RenderBoundary.tsx'
import { appendToDraft } from 'dsh-better-sidebar/src/client/conversation-draft.ts'
import { BrowserIcon } from './icons.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './desktop-workbench.module.css'

/** Cordis owns the right-side layout; Better Sidebar owns session tabs and viewers. */
export function installDesktopWorkbench(ctx: ClientContext, store: SidebarStore, service: BetterSidebarService): void {
  ctx.slots.inject('desktop.workbench', () => ctx.slots.register({ name: 'desktop.workbench' },
    (layout: DesktopWorkbenchOwnerProps) => <DesktopWorkbench {...layout} ctx={ctx} store={store} service={service} />))
}

export function DesktopWorkbench({ ctx, store, service, width, minWidth, maxWidth, onResize }: DesktopWorkbenchOwnerProps & { ctx: ClientContext; store: SidebarStore; service: BetterSidebarService }) {
  const t = ctx.locale.bind(BROWSER_LOCALE)
  const context = ctx as unknown as Context
  const sessions = useSyncExternalStore(useCallback(notify => ctx.sessions.list.subscribe(notify), [ctx]), () => ctx.sessions.list.getSnapshot())
  const snapshot = useSyncExternalStore(useCallback(notify => store.subscribe(notify), [store]), () => store.getSnapshot())
  const [, changed] = useReducer(value => value + 1, 0)
  useEffect(() => service.subscribe(changed), [service])
  useEffect(() => { store.setSession(sessions.current) }, [store, sessions.current])
  const panel = useRef<HTMLElement>(null)
  const drag = useRef({ x: 0, width: 0 })
  const sessionId = sessions.current
  const state = snapshot.sessionId === sessionId ? snapshot.state : undefined
  if (!sessionId || !state) return <div className={css.rail}><button disabled title={t('sidebarChooseSession')} aria-label={t('sidebarChooseSession')}><BrowserIcon name="panel" /></button></div>
  const cwd = sessions.byId[sessionId]?.cwd
  const scope = { sessionId, ...(cwd ? { cwd } : {}) }
  const leaves = [...allLeaves(state.bottomSplits)]
  const tabs = leaves.flatMap(leaf => leaf.tabs)
  const selected = (leaves.find(leaf => leaf.id === state.activePane) ?? leaves[0])?.active
  const descriptors = service.getTabs().filter(tab => !tab.hidden && service.isTabEnabled(tab.id)).sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  const toggle = () => store.reduce(toggleBottomPanel)
  const resize = (nextWidth: number) => onResize(Math.max(minWidth, Math.min(maxWidth, nextWidth)))
  return <>
    {!state.bottomOpen && <div className={css.rail}><button onClick={toggle} aria-label={t('sidebarOpen')} title={t('sidebarOpen')}><BrowserIcon name="panel" /></button></div>}
    <aside ref={panel} hidden={!state.bottomOpen} className={css.sidebar} style={{ width }} aria-label="Better Sidebar" data-deepdeck-workbench>
    <div className={css.resize} role="separator" aria-label={t('filesResize')} aria-orientation="vertical" aria-valuenow={width} aria-valuemin={minWidth} aria-valuemax={maxWidth} tabIndex={0}
      onPointerDown={event => { drag.current = { x: event.clientX, width: panel.current?.getBoundingClientRect().width ?? width }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(drag.current.width + drag.current.x - event.clientX) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(width + (event.key === 'ArrowLeft' ? 20 : -20)) } }} />
    <div className={css.heading}><strong>Better Sidebar</strong><button onClick={toggle} title={t('sidebarClose')} aria-label={t('sidebarClose')}><BrowserIcon name="close" /></button></div>
    <div className={css.toolbar}>
      <div className={css.tabs} role="tablist" aria-label="Better Sidebar">
        {tabs.map(tab => <div className={css.tab} data-selected={selected === tab.id} key={tab.id}>
          <button role="tab" aria-selected={selected === tab.id} title={tab.path ?? tab.title} onClick={() => service.activateTab(tab.id, scope)}>{tab.title}</button>
          <button aria-label={`${t('closeTab')}: ${tab.title}`} onClick={() => service.closeTab(tab.id, scope)}><BrowserIcon name="close" /></button>
        </div>)}
      </div>
      <select aria-label={t('sidebarNewTab')} value="" onChange={event => { if (event.target.value) service.openTab({ type: event.target.value }, scope) }}>
        <option value="">+</option>
        {descriptors.map(tab => <option key={tab.id} value={tab.id} disabled={!(tab.available?.(context, scope, state) ?? true)}>{typeof tab.title === 'function' ? tab.title() : tab.title}</option>)}
      </select>
    </div>
    {!tabs.length && <p className={css.empty}>{t('sidebarEmpty')}</p>}
    {tabs.map(tab => {
      const descriptor = service.getTab(tab.type)
      return <div className={css.content} key={`${sessionId}:${tab.id}`} hidden={selected !== tab.id}>
        <RenderBoundary>{descriptor ? createElement(descriptor.component, {
          ctx: context, store, scope, tab, visible: state.bottomOpen && selected === tab.id, expanded: state.expanded, revealed: [],
          onToggleDir: path => store.reduce(state => toggleExpanded(state, path)),
          onReferenceFile: path => { appendToDraft(context, sessionId, `@${path}`) },
          onOpenDiff: diff => store.reduce(state => openTabInBottomPane(state, diff)),
          onSubagentJump: id => ctx.sessions.open(id as Parameters<typeof ctx.sessions.open>[0]),
        }) : <p>{t('sidebarUnavailable')}</p>}</RenderBoundary>
      </div>
    })}
    </aside>
  </>
}
