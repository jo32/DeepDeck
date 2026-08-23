import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BunBuildLogs,
  BunBuildPreview,
  BunBuildResult,
  BunBuilderRuntimeStatus,
  BunHotUpdateResult,
} from '../api-types.js'
import {
  BunBuilderClientError,
  discardBuild,
  executeBuild,
  executeHotUpdate,
  previewBuild,
  readStatus,
} from './api.js'
import type { BunBuilderLocaleKey } from './locales.js'
import css from './BunBuilderSettingsTab.module.css'

export type BunBuilderSettingsTabProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'deepdeck.bunBuilder'>

type Phase = 'idle' | 'previewing' | 'ready' | 'building' | 'failed' | 'complete'
type Operation = 'pack' | 'hot-update'

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function Logs({ logs, t }: { readonly logs: Partial<BunBuildLogs>; readonly t: BunBuilderSettingsTabProps['t'] }) {
  const rows: readonly [BunBuilderLocaleKey, string | undefined][] = [
    ['installLog', logs.install],
    ['buildLog', logs.build],
    ['packLog', logs.pack],
  ]
  if (!rows.some(([, value]) => value !== undefined && value.length > 0)) return null
  return (
    <div className={css.logs}>
      <strong>{t('logs')}</strong>
      {rows.map(([label, value]) => value === undefined || value.length === 0 ? null : (
        <details key={label}>
          <summary>{t(label)}</summary>
          <pre>{value}</pre>
        </details>
      ))}
    </div>
  )
}

export function BunBuilderSettingsTab({ t }: BunBuilderSettingsTabProps): ReactNode {
  const [runtime, setRuntime] = useState<BunBuilderRuntimeStatus>()
  const [sourceDirectory, setSourceDirectory] = useState('')
  const [packageSubdirectory, setPackageSubdirectory] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<BunBuildPreview>()
  const [result, setResult] = useState<BunBuildResult>()
  const [hotUpdateResult, setHotUpdateResult] = useState<BunHotUpdateResult>()
  const [operation, setOperation] = useState<Operation>('pack')
  const [error, setError] = useState<string>()
  const [failureLogs, setFailureLogs] = useState<Partial<BunBuildLogs>>()
  const previewIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    void readStatus().then(
      value => { if (active) setRuntime(value) },
      cause => {
        if (active) setRuntime({ available: false, busy: false, error: cause instanceof Error ? cause.message : String(cause) })
      },
    )
    return () => { active = false }
  }, [])

  useEffect(() => () => {
    const previewId = previewIdRef.current
    if (previewId !== undefined) void discardBuild(previewId).catch(() => {})
  }, [])

  const reset = (): void => {
    const current = preview
    setPreview(undefined)
    setResult(undefined)
    setHotUpdateResult(undefined)
    setError(undefined)
    setFailureLogs(undefined)
    setPhase('idle')
    previewIdRef.current = undefined
    if (current !== undefined) void discardBuild(current.previewId).catch(() => {})
  }

  const inspect = async (): Promise<void> => {
    setError(undefined)
    setFailureLogs(undefined)
    setPhase('previewing')
    try {
      const next = await previewBuild(sourceDirectory.trim(), packageSubdirectory.trim())
      previewIdRef.current = next.previewId
      setPreview(next)
      setPhase('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('idle')
    }
  }

  const build = async (): Promise<void> => {
    if (preview === undefined) return
    setError(undefined)
    setFailureLogs(undefined)
    setOperation('pack')
    setPhase('building')
    try {
      setResult(await executeBuild(preview))
      setPhase('complete')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      if (cause instanceof BunBuilderClientError) setFailureLogs(cause.logs)
      setPhase('failed')
    }
  }

  const hotUpdate = async (): Promise<void> => {
    if (preview === undefined || !preview.hotUpdateAvailable) return
    setError(undefined)
    setFailureLogs(undefined)
    setOperation('hot-update')
    setPhase('building')
    try {
      setHotUpdateResult(await executeHotUpdate(preview))
      setPhase('complete')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      if (cause instanceof BunBuilderClientError) setFailureLogs(cause.logs)
      setPhase('failed')
    }
  }

  const runtimeReady = runtime?.available === true
  return (
    <section className={css.surface} aria-busy={phase === 'previewing' || phase === 'building'}>
      <header className={css.heading}>
        <h2>{t('title')}</h2>
        <p>{t('subtitle')}</p>
      </header>
      <div className={css.runtime}>
        <span className={css.runtimeDot} data-ready={runtimeReady} aria-hidden="true" />
        {runtime === undefined
          ? t('runtimeChecking')
          : runtimeReady
            ? `${t('runtimeReady')}${runtime.version === undefined ? '' : ` · ${runtime.version}`}`
            : `${t('runtimeUnavailable')}${runtime.error === undefined ? '' : ` · ${runtime.error}`}`}
      </div>

      {phase === 'idle' || phase === 'previewing' ? (
        <div className={css.form}>
          <label className={css.field}>
            <span>{t('sourceDirectory')}</span>
            <input
              value={sourceDirectory}
              placeholder={t('sourcePlaceholder')}
              disabled={phase === 'previewing'}
              onChange={event => { setSourceDirectory(event.currentTarget.value) }}
            />
          </label>
          <label className={css.field}>
            <span>{t('packageSubdirectory')}</span>
            <input
              value={packageSubdirectory}
              placeholder={t('packagePlaceholder')}
              disabled={phase === 'previewing'}
              onChange={event => { setPackageSubdirectory(event.currentTarget.value) }}
            />
          </label>
          <div className={css.actions}>
            <Button
              variant="primary"
              disabled={!runtimeReady || sourceDirectory.trim().length === 0 || phase === 'previewing'}
              onClick={() => { void inspect() }}
            >{phase === 'previewing' ? t('previewing') : t('preview')}</Button>
          </div>
        </div>
      ) : null}

      {error !== undefined ? <div className={css.error} role="alert"><strong>{t('error')}</strong><br />{error}</div> : null}
      {failureLogs !== undefined ? <Logs logs={failureLogs} t={t} /> : null}

      {preview !== undefined && phase !== 'idle' && phase !== 'previewing' ? (
        <div className={css.card}>
          <h3>{phase === 'complete' ? t('completed') : phase === 'failed' ? t('failed') : t('plan')}</h3>
          <dl className={css.details}>
            <div><dt>{t('package')}</dt><dd><code>{preview.confirmation}</code></dd></div>
            <div><dt>{t('packageKind')}</dt><dd>{t(preview.packageKind === 'bundle' ? 'bundleKind' : 'pluginKind')}</dd></div>
            <div><dt>{t('buildScript')}</dt><dd><code>{preview.buildScript}</code></dd></div>
            {preview.bundlePatch === undefined
              ? null
              : <div><dt>{t('bundlePatch')}</dt><dd><code>{preview.bundlePatch}</code></dd></div>}
            <div><dt>{t('installMode')}</dt><dd>{t(preview.frozenInstall ? 'frozen' : 'unfrozen')}</dd></div>
            <div>
              <dt>{t('hotUpdate')}</dt>
              <dd>{preview.hotUpdateAvailable ? t('hotUpdateReady') : (preview.hotUpdateReason ?? t('hotUpdateUnavailable'))}</dd>
            </div>
          </dl>
          <div className={css.warning}>
            <strong>{t('warningTitle')}</strong>
            {t('warning')}
          </div>
          {preview.hotUpdateAvailable ? (
            <div className={css.liveWarning}>
              <strong>{t('hotUpdateWarningTitle')}</strong>
              {t('hotUpdateWarning')}
            </div>
          ) : null}
          {phase === 'building'
            ? <p className={css.busy}>{t(operation === 'hot-update' ? 'hotUpdating' : 'building')}</p>
            : null}
          {result !== undefined ? (
            <>
              <div className={css.artifact}>
                <strong>{t('artifact')}</strong>
                <code>{result.artifactPath}</code>
                <span>{t('size')}: {formatBytes(result.artifactBytes)}</span>
                <span>{t('sha256')}: <code>{result.artifactSha256}</code></span>
              </div>
              <Logs logs={result.logs} t={t} />
              <div className={css.actions}>
                <Button variant="outline" onClick={reset}>{t('retry')}</Button>
              </div>
            </>
          ) : hotUpdateResult !== undefined ? (
            <>
              <div className={css.artifact}>
                <strong>{t('hotUpdateCompleted')}</strong>
                <code>{hotUpdateResult.sourcePackageRoot}</code>
                <span>{t(hotUpdateResult.hostReloaded ? 'hostReloaded' : 'hostReloadNotObserved')}</span>
              </div>
              <Logs logs={{ build: hotUpdateResult.buildLog }} t={t} />
              <div className={css.actions}>
                <Button variant="outline" onClick={reset}>{t('retry')}</Button>
              </div>
            </>
          ) : phase === 'failed' ? (
            <div className={css.actions}>
              <Button variant="outline" onClick={reset}>{t('retry')}</Button>
            </div>
          ) : (
            <div className={css.actions}>
              <Button
                variant="primary"
                disabled={phase === 'building' || !preview.hotUpdateAvailable}
                onClick={() => { void hotUpdate() }}
              >
                {phase === 'building' && operation === 'hot-update' ? t('hotUpdating') : t('confirmHotUpdate')}
              </Button>
              <Button variant="outline" disabled={phase === 'building'} onClick={() => { void build() }}>
                {phase === 'building' && operation === 'pack' ? t('building') : t('confirmBuild')}
              </Button>
              <Button variant="outline" disabled={phase === 'building'} onClick={reset}>{t('discard')}</Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
