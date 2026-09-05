import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepdeck/dsh-client-ui-desktop-chrome/sidebar-contract'
import type { BrowserMode, BrowserSite, BrowserState, BrowserNativeCommand, BrowserSnapshot } from '../contracts.js'
import { addressTarget, type BrowserAgentSelection, type BrowserClientService } from './browser-api.js'
import { BrowserIcon, type BrowserIconName } from './icons.js'
import { BROWSER_LOCALE } from './locales.js'
import { BrowserComposerProvider } from './BrowserComposerOverflow.js'
import type { DeepDeckCharacterService } from '@deepdeck/dsh-client-ui-home-hero/character-contract'
import { BrowserConversationContext } from './BrowserConversation.js'
import { BrowserPageSelectionContext, selectionDraft } from './BrowserPageSelection.js'
import type { BrowserPageMenuLabels } from '../native-contract.js'
import type { ContextType } from 'react'
import { BrowserAuthentication } from './BrowserAuthentication.js'
import { BrowserDownloads } from './BrowserDownloads.js'
import { BrowserStartPage } from './BrowserStartPage.js'
import { tabMenu } from './tab-menu.js'
import css from './browser.module.css'

export interface BrowserFrameInjected { browser: BrowserClientService; character: DeepDeckCharacterService }
export type BrowserFrameProps = PropsRuntime<'desktop.surface'>
  & PropsLocale<typeof BROWSER_LOCALE>
  & BrowserFrameInjected

function IconButton({ icon, label, onClick, disabled = false, pressed }: {
  icon: BrowserIconName; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean
}) {
  return <button type="button" className={css.iconButton} title={label} aria-label={label}
    aria-pressed={pressed} disabled={disabled} onClick={onClick}><BrowserIcon name={icon} /></button>
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function TabSymbol({ favicon, loading }: { favicon: string | undefined; loading: boolean }) {
  const [failed, setFailed] = useState<string>()
  if (loading) return <BrowserIcon name="reload" />
  if (favicon && /^https?:\/\//.test(favicon) && failed !== favicon) {
    return <img src={favicon} alt="" referrerPolicy="no-referrer" onError={() => { setFailed(favicon) }} />
  }
  return <BrowserIcon name="globe" />
}

export function BrowserFrame({ browser, character, t, renderConversation, useSessions }: BrowserFrameProps) {
  const [state, setState] = useState<BrowserState>()
  const [error, setError] = useState<string>()
  const [address, setAddress] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [blankPanelTabId, setBlankPanelTabId] = useState<string>()
  const [panelWidth, setPanelWidth] = useState(420)
  const [panelTab, setPanelTab] = useState<'conversation' | 'tools' | 'downloads'>('conversation')
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const findInput = useRef<HTMLInputElement>(null)
  const draggedTab = useRef<string | undefined>(undefined)
  const addressEditing = useRef(false)
  const tabButtons = useRef(new Map<string, HTMLButtonElement>())
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<BrowserAgentSelection>()
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const [welcomeTarget, setWelcomeTarget] = useState<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<BrowserMode>('use')
  const toolbar = useRef<HTMLElement>(null)
  const panel = useRef<HTMLElement>(null)
  const addressInput = useRef<HTMLInputElement>(null)
  const resizeGrabOffset = useRef(4)
  const requestSequence = useRef(0)
  const pendingStart = useRef<{ tabId: string; mode: BrowserMode } | undefined>(undefined)
  const appliedSelections = useRef(new Set<string>())
  const acknowledgingSelections = useRef(new Set<string>())
  const acknowledgedSelections = useRef(new Set<string>())
  const openedSelection = useRef<string | undefined>(undefined)
  const active = state?.native.tabs.find(tab => tab.id === state.native.activeTabId)
  const zoom = active?.zoomFactor ?? 1
  const site = state?.sites.find(item => item.origin === active?.origin)
  const sessionId = site?.sessionId
  const session = useSessions(snapshot => sessionId === undefined ? undefined : snapshot.byId[sessionId as keyof typeof snapshot.byId])
  const currentSession = useSessions(snapshot => snapshot.current)
  const running = session?.running === true
  const blank = active === undefined || active.url === 'about:blank' || active.origin === 'null' || active.origin === ''
  // A new tab gets the entire start page. A user's explicit panel action still
  // works there, without opening an empty panel on every subsequent new tab.
  const panelVisible = panelOpen && (!blank || (active !== undefined && blankPanelTabId === active.id))
  const authentication = state?.native.authentication?.find(value => value.tabId === active?.id)
  const pageSelection = state?.native.selections?.find(value => value.tabId === active?.id && value.documentId === active.documentId)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current
    const next = await browser.request<BrowserState>({ action: 'state' }, signal)
    if (!signal?.aborted && sequence === requestSequence.current) setState(next)
  }, [browser])

  useEffect(() => {
    const labels: BrowserPageMenuLabels = {
      saveLink: t('pageMenu.saveLink'),
      openImage: t('pageMenu.openImage'),
      copyImage: t('pageMenu.copyImage'),
      saveImage: t('pageMenu.saveImage'),

      copy: t('pageMenu.copy'),
      cut: t('pageMenu.cut'),
      paste: t('pageMenu.paste'),
      selectAll: t('pageMenu.selectAll'),
      undo: t('pageMenu.undo'),
      redo: t('pageMenu.redo'),
      searchSelection: t('pageMenu.searchSelection'),
      askAgent: t('pageMenu.askAgent'),
      openLink: t('pageMenu.openLink'),
      copyLink: t('pageMenu.copyLink'),
      back: t('pageMenu.back'),
      forward: t('pageMenu.forward'),
      reload: t('pageMenu.reload'),
      inspect: t('pageMenu.inspect'),
    }
    void browser.request({ action: 'command', command: { action: 'page.menu.configure', labels } })
      .catch(failure => { setError(message(failure)) })
  }, [browser, t])

  useEffect(() => {
    if (!pageSelection || openedSelection.current === pageSelection.id) return
    openedSelection.current = pageSelection.id
    setPanelOpen(true)
    setPanelTab('conversation')
  }, [pageSelection?.id])

  const applySelection = useCallback<NonNullable<ContextType<typeof BrowserPageSelectionContext>>['apply']>((value, input, actions) => {
    if (acknowledgingSelections.current.has(value.id) || acknowledgedSelections.current.has(value.id)) return
    if (!appliedSelections.current.has(value.id)) {
      actions.setDraft(selectionDraft(input.draft, value))
      appliedSelections.current.add(value.id)
    }
    acknowledgingSelections.current.add(value.id)
    void browser.request({ action: 'command', command: { action: 'page.selection.ack', id: value.id } })
      .then(() => { acknowledgedSelections.current.add(value.id); return refresh() }).catch(failure => { setError(message(failure)) })
      .finally(() => { acknowledgingSelections.current.delete(value.id) })
  }, [browser, refresh])

  useEffect(() => {
    const abort = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try { await refresh(abort.signal) }
      catch (failure) { if (!abort.signal.aborted) setError(message(failure)) }
      if (!abort.signal.aborted) timeout = setTimeout(() => { void poll() }, 1000)
    }
    void poll()
    return () => { abort.abort(); if (timeout !== undefined) clearTimeout(timeout) }
  }, [refresh])

  const command = useCallback(async (value: BrowserNativeCommand) => {
    try {
      if (value.action.startsWith('tab.') && value.action !== 'tab.menu') pendingStart.current = undefined
      setError(undefined)
      await browser.request({ action: 'command', command: value })
      await refresh()
    } catch (failure) { setError(message(failure)) }
  }, [browser, refresh])

  useEffect(() => { if (!addressEditing.current) setAddress(active?.url === 'about:blank' ? '' : active?.url ?? '') }, [active?.url])
  useEffect(() => {
    addressEditing.current = false
    setAddress(active?.url === 'about:blank' ? '' : active?.url ?? '')
    tabButtons.current.get(active?.id ?? '')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active?.id])
  useEffect(() => { setFindText(active?.find?.text ?? ''); setFindOpen(!!active?.find?.text) }, [active?.id, active?.documentId])
  useEffect(() => {
    if (!findOpen || !active) return
    const tabId = active.id
    const timer = setTimeout(() => { void command({ action: 'find', tabId, text: findText }) }, 150)
    return () => clearTimeout(timer)
  }, [findOpen, findText, active?.id, command])
  useLayoutEffect(() => { if (findOpen) { findInput.current?.focus(); findInput.current?.select() } }, [findOpen])
  useEffect(() => { setMode(site?.mode ?? 'use') }, [site?.id, site?.mode])

  // A website view is native and sits above the trusted shell. Measure only
  // plugin-owned refs so it never covers the toolbar or the Agent panel.
  useLayoutEffect(() => {
    const header = toolbar.current
    if (header === null) return
    let previous = ''
    const resize = () => {
      const top = Math.ceil(header.getBoundingClientRect().bottom)
      const right = panelVisible ? Math.ceil(panel.current?.getBoundingClientRect().width ?? 430) : 0
      const dimensions = `${String(top)}:${String(right)}`
      if (dimensions === previous) return
      previous = dimensions
      void browser.request({ action: 'command', command: { action: 'layout', top, right } })
        .catch(failure => { setError(message(failure)) })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(header)
    if (panel.current !== null) observer.observe(panel.current)
    resize()
    return () => observer.disconnect()
  }, [browser, panelVisible, findOpen, utilitiesOpen, authentication?.id, error])

  // Switching websites switches the displayed Harness Session. A running
  // task keeps its original native tab binding until it is idle again.
  useEffect(() => {
    if (active === undefined || blank || active.loading || !panelVisible || panelTab !== 'conversation' || busy || pendingStart.current) return
    if (site?.sessionId && session === undefined) return
    const abort = new AbortController()
    void browser.prepareAgent(active.id, site?.mode ?? 'use', 'auto', abort.signal).then(value => {
      if (!abort.signal.aborted) { setSelection(value); void refresh(abort.signal).catch(() => {}) }
    }).catch(failure => { if (!abort.signal.aborted) setError(message(failure)) })
    return () => abort.abort()
  }, [browser, refresh, panelVisible, panelTab, blank, active?.loading, active?.id, active?.origin, site?.id, site?.sessionId, site?.mode, site?.boundTabId, session === undefined, running, busy, restoreAttempt])

  const startAgent = useCallback(async (nextMode: BrowserMode) => {
    if (active === undefined || blank || busy) return
    setBusy(true)
    setError(undefined)
    setPanelOpen(true)
    setPanelTab('conversation')
    try {
      const next = await browser.prepareAgent(active.id, nextMode, true)
      setSelection(next)
      setMode(nextMode)
      await refresh()
    } catch (failure) { setError(message(failure)) }
    finally { setBusy(false) }
  }, [active?.id, blank, browser, busy, refresh])

  useEffect(() => {
    const pending = pendingStart.current
    if (!pending || active?.id !== pending.tabId || blank || active.loading || busy) return
    pendingStart.current = undefined
    if (!active.error) void startAgent(pending.mode)
  }, [active?.id, active?.loading, active?.error, blank, busy, startAgent])

  const openFromStart = async (value: string, nextMode?: BrowserMode) => {
    try {
      const url = addressTarget(value)
      setError(undefined)
      const snapshot = await browser.request<BrowserSnapshot>({ action: 'command', command: active === undefined
        ? { action: 'tab.open', url } : { action: 'tab.navigate', tabId: active.id, url } })
      // Bind the chosen mode to the tab, then wait for its navigation (including
      // redirects) to finish before preparing the normal Harness site session.
      pendingStart.current = nextMode !== undefined && url !== 'about:blank' && snapshot.activeTabId !== undefined
        ? { tabId: snapshot.activeTabId, mode: nextMode } : undefined
      await refresh()
    } catch (failure) { setError(message(failure)) }
  }

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    try {
      const url = addressTarget(address)
      void command(active === undefined ? { action: 'tab.open', url } : { action: 'tab.navigate', tabId: active.id, url })
      addressInput.current?.blur()
    } catch (failure) { setError(message(failure)) }
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const mac = /Mac/i.test(navigator.platform)
      const mod = mac ? event.metaKey : event.ctrlKey
      if (event.key === 'Escape') {
        if (findOpen) { event.preventDefault(); closeFind() }
        else if (utilitiesOpen) { event.preventDefault(); setUtilitiesOpen(false) }
        else if (active?.loading) void command({ action: 'tab.stop', tabId: active.id })
        return
      }
      if (mod && !event.altKey && event.key.toLowerCase() === 'j' && (mac ? event.shiftKey : !event.shiftKey)) {
        event.preventDefault(); setBlankPanelTabId(active?.id); setPanelOpen(true); setPanelTab('downloads'); return
      }
      if (!mod || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === 'l') { event.preventDefault(); addressInput.current?.focus(); addressInput.current?.select() }
      else if (key === 'f') { event.preventDefault(); setFindOpen(true); findInput.current?.focus(); findInput.current?.select() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [active?.id, active?.loading, command, findOpen, utilitiesOpen])

  const closeFind = () => {
    setFindOpen(false); setFindText('')
    if (active) void command({ action: 'find', tabId: active.id, text: '' })
  }
  const find = (forward = true) => {
    if (active !== undefined) void command({ action: 'find', tabId: active.id, text: findText, forward, next: true })
  }
  const changeZoom = (increment: number) => {
    const steps = [.25, .33, .5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
    const factor = increment > 0 ? steps.find(value => value > zoom + .001) ?? 5 : steps.reverse().find(value => value < zoom - .001) ?? .25
    if (active !== undefined) void command({ action: 'zoom', tabId: active.id, factor })
  }
  const updateSite = async (action: 'toggle' | 'rollback', revision?: string) => {
    if (site === undefined) return
    try {
      setError(undefined)
      if (action === 'toggle') await browser.request<BrowserSite>({ action: 'site.toggle', siteId: site.id, enabled: !site.enabled })
      else if (revision !== undefined) await browser.request<BrowserSite>({ action: 'site.rollback', siteId: site.id, revision })
      await refresh()
    } catch (failure) { setError(message(failure)) }
  }
  const selectedReady = !busy && selection !== undefined && selection.siteId === site?.id
    && selection.sessionId === currentSession && (selection.tabId === active?.id || running)
  const pinned = selectedReady && selection.tabId !== active?.id
  const sourceCount = active?.tools.filter(tool => tool.source === 'site').length ?? 0
  const generatedCount = active?.tools.filter(tool => tool.source === 'deepdeck').length ?? 0
  const siteLabel = blank ? t('agent') : active?.origin.replace(/^https?:\/\//, '') ?? t('agent')
  const resizePanel = (width: number) => { setPanelWidth(Math.max(340, Math.min(640, window.innerWidth * .55, width))) }

  return <div className={css.browser} data-deepdeck-browser data-deepdeck-desktop-frame style={{ '--browser-panel-width': panelVisible ? `min(${panelWidth}px, 55vw)` : '0px' } as CSSProperties}>
    <header ref={toolbar} className={css.chrome}>
      <div className={css.tabBar}>
        <div className={css.trafficSpace} data-mac={/Mac/i.test(navigator.platform)} aria-hidden="true" />
        <div role="tablist" className={css.tabs} aria-label={t('browser')}>
          {state?.native.tabs.map(tab => <div key={tab.id} className={css.tab} data-active={tab.id === active?.id} draggable
            onDragStart={event => { draggedTab.current = tab.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', tab.id) }}
            onDragEnd={() => { draggedTab.current = undefined }}
            onDragOver={event => { if (draggedTab.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
            onDrop={event => {
              event.preventDefault()
              const id = draggedTab.current; draggedTab.current = undefined
              if (id && id !== tab.id) void command({ action: 'tab.move', tabId: id, index: state.native.tabs.findIndex(value => value.id === tab.id) })
            }}
            onMouseDown={event => { if (event.button === 1) event.preventDefault() }}
            onAuxClick={event => {
              if (event.button !== 1) return
              event.preventDefault()
              void command({ action: 'tab.close', tabId: tab.id })
            }}
            onContextMenu={event => {
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              void command({ action: 'tab.menu', items: tabMenu(state.native, tab.id, t),
                x: event.clientX || rect.left + 12, y: event.clientY || rect.bottom })
            }}>
            <button ref={element => { if (element) tabButtons.current.set(tab.id, element); else tabButtons.current.delete(tab.id) }} type="button" role="tab" aria-selected={tab.id === active?.id} className={css.tabSelect}
              onClick={() => { void command({ action: 'tab.activate', tabId: tab.id }) }} title={tab.title || tab.url}>
              <span className={css.tabSymbol} data-loading={tab.loading}><TabSymbol favicon={tab.favicon} loading={tab.loading} /></span>
              <span>{tab.title && tab.title !== 'about:blank' ? tab.title : t('newTab')}</span>
            </button>
            {(tab.audible || tab.muted) && <button type="button" className={css.tabClose} title={t(tab.muted ? 'unmuteTab' : 'muteTab')} aria-label={t(tab.muted ? 'unmuteTab' : 'muteTab')}
              onClick={() => { void command({ action: 'tab.mute', tabId: tab.id, muted: !tab.muted }) }}><BrowserIcon name={tab.muted ? 'muted' : 'volume'} /></button>}
            <button type="button" className={css.tabClose} aria-label={`${t('closeTab')}: ${tab.title && tab.title !== 'about:blank' ? tab.title : t('newTab')}`}
              onClick={() => { void command({ action: 'tab.close', tabId: tab.id }) }}><BrowserIcon name="close" /></button>
          </div>)}
        </div>
        <IconButton icon="plus" label={t('newTab')} onClick={() => { void command({ action: 'tab.open' }) }} />
        <span className={css.windowTitle}>DeepDeck<span>Browser</span></span>
      </div>
      <div className={css.addressBar}>
        <IconButton icon="back" label={t('back')} disabled={!active?.canGoBack} onClick={() => { if (active) void command({ action: 'tab.back', tabId: active.id }) }} />
        <IconButton icon="forward" label={t('forward')} disabled={!active?.canGoForward} onClick={() => { if (active) void command({ action: 'tab.forward', tabId: active.id }) }} />
        <IconButton icon={active?.loading ? 'stop' : 'reload'} label={t(active?.loading ? 'stop' : 'reload')} disabled={active === undefined}
          onClick={() => { if (active) void command({ action: active.loading ? 'tab.stop' : 'tab.reload', tabId: active.id }) }} />
        <form className={css.addressForm} onSubmit={navigate}>
          <IconButton icon={blank ? 'search' : active?.url.startsWith('https:') ? 'shield' : 'globe'} label={t('siteInfo')} disabled={blank}
            onClick={() => { if (active) void command({ action: 'tab.siteInfo', tabId: active.id }) }} />
          <input ref={addressInput} value={address} onChange={event => { setAddress(event.target.value) }}
            onFocus={event => { addressEditing.current = true; event.currentTarget.select() }}
            onBlur={() => { addressEditing.current = false }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setAddress(active?.url === 'about:blank' ? '' : active?.url ?? ''); event.currentTarget.blur() }
              if (event.key === 'Enter' && event.altKey) {
                event.preventDefault()
                try { void command({ action: 'tab.open', url: addressTarget(address) }); event.currentTarget.blur() } catch (failure) { setError(message(failure)) }
              }
            }} aria-label={t('address')} placeholder={t('address')} spellCheck={false} autoComplete="off" />
          {!blank && <button type="button" className={css.toolPill} onClick={() => { setPanelOpen(true); setPanelTab('tools') }} title={t('tools')}>
            <span className={css.statusDot} data-ready={(active?.tools.length ?? 0) > 0} />WebMCP <span>{active?.tools.length ?? 0}</span>
          </button>}
        </form>
        {zoom !== 1 && <button type="button" className={css.zoomBadge} aria-label={t('zoomReset')} title={t('zoomReset')} onClick={() => { if (active) void command({ action: 'zoom', tabId: active.id, factor: 1 }) }}>{Math.round(zoom * 100)}%</button>}
        <IconButton icon="more" label={t('moreBrowser')} pressed={utilitiesOpen} onClick={() => { setUtilitiesOpen(value => !value) }} />
        <IconButton icon="download" label={t('downloads')} pressed={panelVisible && panelTab === 'downloads'} onClick={() => { setBlankPanelTabId(active?.id); setPanelOpen(true); setPanelTab('downloads') }} />
        <button type="button" className={css.agentToggle} aria-pressed={panelVisible} onClick={() => { setBlankPanelTabId(active?.id); setPanelOpen(!panelVisible) }} title={t(panelVisible ? 'hideAgent' : 'agent')}>
          <BrowserIcon name="panel" /><span>{t('agent')}</span>
        </button>
      </div>
      {authentication && <BrowserAuthentication key={authentication.id} challenge={authentication} command={command} t={t} />}
      {utilitiesOpen && <div className={css.utilityBar} role="toolbar" aria-label={t('moreBrowser')}>
        <button type="button" disabled={blank} onClick={() => { setFindOpen(true); findInput.current?.focus() }}>{t('find')}</button>
        <div className={css.zoom}>
          <button type="button" disabled={!active || zoom <= .25} aria-label={t('zoomOut')} onClick={() => { changeZoom(-1) }}>−</button>
          <button type="button" className={css.zoomValue} aria-label={t('zoomReset')} title={t('zoomReset')} onClick={() => { if (active) void command({ action: 'zoom', tabId: active.id, factor: 1 }) }}>{Math.round(zoom * 100)}%</button>
          <button type="button" disabled={!active || zoom >= 5} aria-label={t('zoomIn')} onClick={() => { changeZoom(1) }}>+</button>
        </div>
        {([['tab.print', 'printPage'], ['tab.save', 'savePage'], ['tab.devtools', 'devtools']] as const).map(([action, label]) => <button type="button" key={action} disabled={blank}
          onClick={() => { if (active) void command({ action, tabId: active.id }) }}>{t(label)}</button>)}
        <button type="button" onClick={() => { void command({ action: 'window.fullscreen' }) }}>{t('fullscreen')}</button>
        <IconButton icon="close" label={t('dismiss')} onClick={() => { setUtilitiesOpen(false) }} />
      </div>}
      {findOpen && <form className={css.findBar} onSubmit={event => { event.preventDefault(); find() }}>
        <input ref={findInput} aria-label={t('find')} placeholder={t('find')} value={findText} onChange={event => { setFindText(event.target.value) }} onKeyDown={event => { if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); find(false) } }} />
        <span role="status" className={css.findCount}>{findText ? active?.find?.matches ? `${active.find.activeMatch} / ${active.find.matches}` : t('noMatches') : ''}</span>
        <IconButton icon="back" label={t('findPrevious')} onClick={() => { find(false) }} />
        <IconButton icon="forward" label={t('findNext')} onClick={() => { find() }} />
        <IconButton icon="close" label={t('closeFind')} onClick={closeFind} />
      </form>}
      {(error !== undefined || state?.available === false) && <div role="alert" className={css.errorBar}>
        <span>{error ?? t('unavailable')}</span><button type="button" onClick={() => { setError(undefined); setRestoreAttempt(value => value + 1); void refresh().catch(failure => { setError(message(failure)) }) }}>{t('retry')}</button>
        <IconButton icon="close" label={t('dismiss')} onClick={() => { setError(undefined) }} />
      </div>}
    </header>

    <main className={css.body}>
      <div className={css.page}>
        {blank && <BrowserStartPage key={active?.id} sites={state?.sites ?? []} onOpen={openFromStart} character={character} t={t} />}
        {!blank && active?.error && <div className={css.welcome}><BrowserIcon name="globe" /><h2>{t('pageFailed')}</h2><p>{active.error}</p>
          <button className={css.primaryButton} onClick={() => { void command({ action: 'tab.reload', tabId: active.id }) }}>{t('retry')}</button>
        </div>}
      </div>
      {panelVisible && <aside ref={panel} className={css.panel} aria-label={t('agent')}>
        <div className={css.resizeHandle} role="separator" aria-label={t('resizePanel')} aria-orientation="vertical" aria-valuemin={340} aria-valuemax={640} aria-valuenow={panelWidth} tabIndex={0}
          onPointerDown={event => {
            resizeGrabOffset.current = event.clientX - (panel.current?.getBoundingClientRect().left ?? event.clientX) + 1
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            // Keep the pointer inside the shell, beyond the native website's
            // newly resized edge. A release over another WebContents may not
            // deliver pointerup here, so also stop on the next buttonless move.
            if (event.buttons !== 1) { event.currentTarget.releasePointerCapture(event.pointerId); return }
            resizePanel(window.innerWidth - event.clientX + resizeGrabOffset.current)
          }}
          onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
          onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resizePanel(panelWidth + (event.key === 'ArrowLeft' ? 20 : -20)) } }} />
        <div className={css.panelHeader}>
          <div className={css.siteAvatar}><character.Icon size={32} /></div>
          <div className={css.siteIdentity}><h2 title={siteLabel}>{siteLabel}</h2><span><i className={css.statusDot} data-ready={selectedReady} />{t(running ? 'working' : selectedReady ? 'connected' : 'ready')}</span></div>
          {!blank && <label className={css.modeSelect} data-builder={mode === 'builder'} title={running ? t('running') : t('mode')}>
            <select aria-label={t('mode')} value={mode} disabled={busy || running} onChange={event => { const value = event.target.value as BrowserMode; void startAgent(value) }}>
              <option value="use">{t('use')}</option><option value="builder">{t('builderShort')}</option>
            </select><BrowserIcon name="chevron" />
          </label>}
          <IconButton icon="close" label={t('hideAgent')} onClick={() => { setPanelOpen(false) }} />
        </div>
        <div className={css.panelNavigation}>
          <div className={css.panelNav} role="tablist" aria-label={t('agent')}>
            {(['conversation', 'tools', 'downloads'] as const).map(item => <button type="button" key={item} data-kind={item} role="tab" aria-selected={panelTab === item} onClick={() => { setPanelTab(item) }} title={t(item === 'conversation' ? 'conversationTab' : item === 'tools' ? 'toolsTab' : 'downloads')} aria-label={t(item === 'conversation' ? 'conversationTab' : item === 'tools' ? 'toolsTab' : 'downloads')}>
              <span>{t(item === 'conversation' ? 'conversationTab' : item === 'tools' ? 'toolsTab' : 'downloads')}</span>
              {item === 'tools' && <span className={css.toolCount}>{active?.tools.length ?? 0}</span>}
            </button>)}
          </div>
        </div>
        {panelTab === 'conversation' && <>
          {pinned && <div className={css.notice}>{t('pinned')}<button type="button" onClick={() => { void command({ action: 'tab.activate', tabId: selection.tabId }) }}>{t('showTarget')}</button></div>}
          <div className={css.conversation}>
            <div ref={setWelcomeTarget} className={css.emptyMessageArea} />
            {selectedReady ? <BrowserComposerProvider panel={panel}>
              <BrowserConversationContext.Provider value={{ mode, t, welcomeTarget }}>
                <BrowserPageSelectionContext.Provider value={{ selection: pageSelection, apply: applySelection }}>
                  <character.DockedComposer>{renderConversation()}</character.DockedComposer>
                </BrowserPageSelectionContext.Provider>
              </BrowserConversationContext.Provider>
            </BrowserComposerProvider> : <div className={css.connectionState} role="status">
              <p>{t(blank ? 'blankAgent' : error ? 'connectionFailed' : 'starting')}</p>
              {!blank && error && <button type="button" className={css.secondaryButton} onClick={() => { setError(undefined); setRestoreAttempt(value => value + 1) }}>{t('retry')}</button>}
            </div>}
          </div>
        </>}
        {panelTab === 'tools' && <div className={css.panelScroll}>
          <div className={css.toolsHero}><div className={css.toolsHeroIcon}><BrowserIcon name="webmcp" /></div><div><span className={css.eyebrow}>WEBMCP</span><h3>{t('tools')}</h3></div><strong>{active?.tools.length ?? 0}</strong></div>
          <p className={css.hint}>{t('merge')}</p>
          {active?.webmcpError && <div role="status" className={css.notice}><strong>{t('toolError')}</strong><p>{active.webmcpError}</p></div>}
          {(active?.tools.length ?? 0) === 0 && <div className={css.emptyTools}><BrowserIcon name="webmcp" /><p>{t(active?.loading ? 'discovering' : 'noTools')}</p>
            {!blank && <button type="button" className={css.secondaryButton} disabled={busy || running} onClick={() => { void startAgent('builder') }}>{t('builder')}</button>}
          </div>}
          {([{ source: 'site', count: sourceCount, label: 'siteTools' }, { source: 'deepdeck', count: generatedCount, label: 'generatedTools' }] as const).map(group => group.count > 0 && <section key={group.source} className={css.toolGroup}>
            <h4>{t(group.label)}<span>{group.count}</span></h4>
            {active?.tools.filter(tool => tool.source === group.source).map(tool => <details className={css.tool} key={`${tool.documentId}:${tool.frameId}:${tool.name}`}>
              <summary><BrowserIcon name="webmcp" /><code>{tool.name}</code><BrowserIcon name="chevron" /></summary>
              <p>{tool.description}</p><span className={css.hint} title={tool.revision}>{tool.origin}{tool.revision ? ` · ${tool.revision.slice(0, 12)}` : ''}</span>
              <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
            </details>)}
          </section>)}
          {site !== undefined && site.revisions.length > 0 && <section className={css.versions}>
            <div className={css.sectionHeading}><h3>{t('versions')}</h3><button type="button" className={css.linkButton} disabled={running} onClick={() => { void updateSite('toggle') }}>{t(site.enabled ? 'disable' : 'enable')}</button></div>
            <p className={css.hint}>{t(site.enabled ? 'enabled' : 'disabled')}{site.activeRevision && <span title={site.activeRevision}> · {site.activeRevision.slice(0, 12)}</span>}</p>
            {site.revisions.slice().reverse().map(revision => <div className={css.version} key={revision}><code title={revision}>{revision.slice(0, 12)}</code><button type="button" disabled={running || revision === site.activeRevision} onClick={() => { void updateSite('rollback', revision) }}>{t('rollback')}</button></div>)}
          </section>}
          {!blank && (active?.tools.length ?? 0) > 0 && <button type="button" className={css.secondaryButton} disabled={busy || running} onClick={() => { void startAgent('builder') }}><BrowserIcon name="webmcp" />{t('builder')}</button>}
        </div>}
        {panelTab === 'downloads' && <BrowserDownloads downloads={state?.native.downloads ?? []} command={command} t={t} />}
      </aside>}
    </main>
  </div>
}
