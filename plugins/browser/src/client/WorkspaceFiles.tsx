import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { FileTree } from 'dsh-better-sidebar/src/client/FileTree.tsx'
import { EditorHost } from 'dsh-better-sidebar/src/client/EditorHost.tsx'
import { builtinViewers } from 'dsh-better-sidebar/src/client/builtins/viewers.tsx'
import { builtinTabs } from 'dsh-better-sidebar/src/client/builtins/tabs.tsx'
import { createSidebarStore, allLeaves, toggleExpanded, type SidebarTab } from 'dsh-better-sidebar/src/client/state.ts'
import { createBetterSidebarService, type TabComponentProps } from 'dsh-better-sidebar/src/client/service.ts'
import { setChunkModuleSystem } from 'dsh-better-sidebar/src/client/chunk-loader.ts'
import { appendToDraft } from 'dsh-better-sidebar/src/client/conversation-draft.ts'
import { uploadToDir, type UploadItem } from 'dsh-better-sidebar/src/client/upload.ts'
import { attachLocale } from 'dsh-better-sidebar/src/client/locales.ts'
import type { Context } from 'dsh-better-sidebar/src/context-types.ts'
import type { BrowserSite } from '../contracts.js'
import type { FsListing } from '../publication-file-contracts.js'
import { addressTarget, browserRequest } from './browser-api.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './publication-files.module.css'
import { installDesktopWorkbench } from './DesktopWorkbench.js'

/** Compose the pinned plugin's public modules; DeepDeck owns the Cordis mount. */
export function createWorkspaceFiles(ctx: ClientContext, options: { desktop?: boolean } = {}) {
  const store = createSidebarStore()
  store.setPrefs({ ...store.getPrefs(), ...(options.desktop ? { openByDefault: true } : {}), editorExplorer: true, browserInterceptLinks: false })
  const service = createBetterSidebarService(store)
  const context = ctx as unknown as Context
  const t = ctx.locale.bind(BROWSER_LOCALE)
  ctx.provide('betterSidebar', service)
  attachLocale(ctx.locale)
  setChunkModuleSystem(ctx.get('modules') as Parameters<typeof setChunkModuleSystem>[0])

  function NativeBrowser({ tab }: TabComponentProps) {
    const [address, setAddress] = useState(tab.path ?? '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const open = useCallback(async (value: string) => {
      setBusy(true); setError('')
      try {
        const url = value.trim() ? addressTarget(value) : undefined
        await browserRequest({ action: 'open', ...(url ? { url } : {}) })
      } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
      finally { setBusy(false) }
    }, [])
    return <form className={css.nativeBrowser} onSubmit={event => { event.preventDefault(); void open(address) }}>
      <p>{t('filesBrowserHint')}</p>
      <input name="native-browser-address" aria-label={t('address')} value={address} onChange={event => setAddress(event.target.value)} placeholder="https://" />
      <button disabled={busy} type="submit">{t('filesOpenBrowser')}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  }
  ctx.effect(() => {
    const disposers = builtinViewers().map(viewer => service.registerFileViewer(viewer))
    if (options.desktop) {
      for (const descriptor of builtinTabs(context).filter(tab => tab.id !== 'browser')) disposers.push(service.registerTab(descriptor))
    } else {
      disposers.push(service.registerTab({ id: 'editor', title: () => t('filesTitle'), order: 10,
        component: props => <EditorHost {...props} expanded={props.expanded ?? []} revealed={[]} onToggleDir={props.onToggleDir ?? (() => {})} onReferenceFile={path => { appendToDraft(context, props.scope.sessionId, `@${path}`) }} /> }))
    }
    disposers.push(service.registerTab({ id: 'browser', title: () => 'DeepDeck Browser', order: 20,
      onOpen: tab => { void browserRequest({ action: 'open', ...(tab.path ? { url: tab.path } : {}) }).catch(error => console.error('DeepDeck Browser could not open', error)) },
      onActivate: tab => { void browserRequest({ action: 'open', ...(tab.path ? { url: tab.path } : {}) }).catch(error => console.error('DeepDeck Browser could not open', error)) },
      urlTarget: url => ['http:', 'https:'].includes(url.protocol), component: props => <NativeBrowser {...props} /> }))
    return () => { for (const dispose of disposers) dispose(); attachLocale(undefined); setChunkModuleSystem(undefined) }
  }, 'deepdeck browser: workspace file viewers and native browser tab')
  if (options.desktop) installDesktopWorkbench(ctx, store, service)

  function Files({ site, root, refreshTick }: { site: BrowserSite; root: FsListing; refreshTick: number }) {
    const sessionId = site.sessionId ?? site.id
    const scope = { sessionId, cwd: site.workspacePath }
    const tabId = `deepdeck-publication:${site.id}:${root.home}`
    const subscribe = useCallback((notify: () => void) => store.subscribe(notify), [])
    const snapshot = useSyncExternalStore(subscribe, () => store.getSnapshot())
    const [uploading, setUploading] = useState(false)
    const [uploadTick, setUploadTick] = useState(0)
    const [fileError, setFileError] = useState('')
    const reference = (path: string) => {
      if (!appendToDraft(context, sessionId, `@${path}`)) setFileError(t('filesReferenceUnavailable'))
    }
    const upload = async (dir: string, items: UploadItem[]) => {
      setUploading(true); setFileError('')
      try {
        const results = await uploadToDir(scope, dir, items)
        const failure = results.find(result => !result.ok)
        if (failure) setFileError(failure.error ?? t('filesUploadFailed'))
        setUploadTick(tick => tick + 1)
      } finally { setUploading(false) }
    }
    useEffect(() => {
      store.setSession(sessionId)
      const manifest = root.entries.find(entry => entry.name === 'webmcp.json')
      const initial = manifest && 'draft' in root
        ? { path: `${root.home}/src/webmcp.ts`, name: 'webmcp.ts' } : manifest
      service.openTab({ type: 'editor', id: tabId, ...(initial ? { path: initial.path, title: initial.name } : {}) }, { sessionId, cwd: site.workspacePath })
      service.updateTab(tabId, { ...(initial ? { path: initial.path, title: initial.name } : {}), meta: { treeOpen: false } })
    }, [sessionId, site.workspacePath, root.home, tabId])
    const state = snapshot.sessionId === sessionId ? snapshot.state : undefined
    const tab: SidebarTab | undefined = state && [...allLeaves(state.bottomSplits)].flatMap(leaf => leaf.tabs).find(tab => tab.id === tabId)
    if (!state || !tab) return <p>{t('filesConnecting')}</p>
    return <div className={css.workspace} data-deepdeck-workspace-files>
      {fileError && <p role="alert">{fileError}</p>}
      <div className={css.filePanes}>
        <div className={css.tree} aria-label={t('filesFolders')}>
          <FileTree store={store} key={root.home} sessionId={sessionId} cwd={root.home} expanded={state.expanded} revealed={[]}
            onToggle={path => store.reduce(state => toggleExpanded(state, path))}
            onOpenFile={path => service.updateTab(tabId, { path, title: path.split(/[\\/]/).pop() ?? path })}
            onReferenceFile={reference} refreshTick={refreshTick + uploadTick} onUploadRequest={(dir, items) => { void upload(dir, items) }} busy={uploading} />
        </div>
        <div className={css.editor} aria-label={t('filesPreview')}>
          <EditorHost ctx={context} store={store} scope={scope} tab={tab} expanded={state.expanded} revealed={[]}
            onToggleDir={path => store.reduce(state => toggleExpanded(state, path))} onReferenceFile={reference} />
        </div>
      </div>
    </div>
  }
  return Files
}
