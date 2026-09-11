import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserSite } from '../contracts.js'
import type { WebMCPMergePreview, WebMCPProjectState } from '../project-contracts.js'
import type { BrowserClientService } from './browser-api.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './community.module.css'

export function WebMCPProjectPanel({ site, browser, running, onContinue, onFiles, onPublish, t }: {
  site: BrowserSite; browser: BrowserClientService; running: boolean; onContinue: () => Promise<void>; onFiles: () => void; onPublish: (intent: 'contribute' | 'fork') => Promise<void>
} & PropsLocale<typeof BROWSER_LOCALE>) {
  const [project, setProject] = useState<WebMCPProjectState | null>(null)
  const [preview, setPreview] = useState<WebMCPMergePreview>()
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true); const operation = useRef(false)
  const previewToken = useRef<string | undefined>(undefined)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (previewToken.current) void browser.request({ action: 'project.cancel', siteId: site.id, token: previewToken.current }).catch(() => {})
    }
  }, [browser, site.id])
  useEffect(() => {
    const controller = new AbortController()
    void browser.request<WebMCPProjectState | null>({ action: 'project.state', siteId: site.id }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setProject(value) })
      .catch(failure => { if (!controller.signal.aborted) setError(String(failure)) })
    return () => controller.abort()
  }, [browser, site.id, site.activeRevision, running, tick])
  const run = async (action: () => Promise<void>) => {
    if (operation.current || running) return
    operation.current = true; setBusy(true); setError('')
    try { await action(); if (mounted.current) setTick(value => value + 1) }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { operation.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className={css.community} aria-label={t('projectTitle')}>
    <div className={css.heading}><h3>{t('projectTitle')}</h3><button disabled={busy} onClick={() => setTick(value => value + 1)}>{t('communityRefresh')}</button></div>
    <p>{t(project ? project.merging ? 'projectConflictHint' : project.changed ? 'projectChanged' : 'projectClean' : 'projectStartHint')}</p>
    {project && <p className={css.muted}>{t('projectBase')} <code>{project.upstream.commit.slice(0, 7)}</code> · {t('projectApplyHint')}</p>}
    <div className={css.actions}>
      <button disabled={busy || running} onClick={() => { void run(onContinue) }}>{t('projectContinue')}</button>
      {project && <>
        <button disabled={busy} onClick={onFiles}>{t('projectFiles')}</button>
        <button disabled={busy || running || project.merging || !!preview} onClick={() => { void run(async () => {
          const value = await browser.request<WebMCPMergePreview>({ action: 'project.preview', siteId: site.id })
          if (mounted.current) { previewToken.current = value.token; setPreview(value) }
          else await browser.request({ action: 'project.cancel', siteId: site.id, token: value.token })
        }) }}>{t('projectCheck')}</button>
      </>}
    </div>
    {preview && <div className={css.preview}>
      <strong>{t('projectUpdate')} · {preview.upstream.commit.slice(0, 7)}</strong>
      <p>{t(preview.conflicts.length ? 'projectConflictHint' : 'projectMergeHint')}</p>
      {preview.conflicts.length > 0 && <ul>{preview.conflicts.map(path => <li key={path}><code>{path}</code></li>)}</ul>}
      <details open><summary>{t('projectDiff')}</summary><pre>{preview.diff || t('projectNoDiff')}</pre></details>
      <div className={css.actions}>
        <button disabled={busy || running} onClick={() => { void run(async () => {
          await browser.request({ action: 'project.merge', siteId: site.id, token: preview.token })
          previewToken.current = undefined
          if (mounted.current) { setPreview(undefined); onFiles() }
        }) }}>{t('projectMerge')}</button>
        <button disabled={busy || running} onClick={() => { void run(async () => {
          await browser.request({ action: 'project.cancel', siteId: site.id, token: preview.token })
          previewToken.current = undefined
          if (mounted.current) setPreview(undefined)
        }) }}>{t('cancel')}</button>
      </div>
    </div>}
    {project?.merging && <div className={css.preview}>
      <ul>{project.conflicts.map(path => <li key={path}><code>{path}</code></li>)}</ul>
      <div className={css.actions}>{(['finish', 'abort'] as const).map(action => <button key={action} disabled={busy || running} onClick={() => { void run(async () => { await browser.request({ action: `project.${action}`, siteId: site.id }) }) }}>{t(action === 'finish' ? 'projectFinish' : 'projectAbort')}</button>)}</div>
    </div>}
    {project && !project.merging && <div className={css.actions}>
      <button disabled={busy || running || !!preview} onClick={() => { void run(() => onPublish('contribute')) }}>{t('projectContribute')}</button>
      <button disabled={busy || running || !!preview} onClick={() => { void run(() => onPublish('fork')) }}>{t('projectFork')}</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </section>
}
