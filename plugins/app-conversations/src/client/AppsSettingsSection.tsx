import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  PropsRenderSlots,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { AppRebuildResult, AppSettingsDescriptor } from '../contracts.js'
import type {} from '../app-settings-contract.js'
import { listApps, rebuildApp } from './apps-api.js'
import type { AppSettingsLocaleKey } from './locales.js'
import css from './AppsSettingsSection.module.css'

export interface AppsSettingsSectionInjected {
  readonly t: (key: AppSettingsLocaleKey) => string
  readonly openCreator: (appId: string) => Promise<void>
}

export type AppsSettingsSectionProps = PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.apps.item'>
  & Partial<InjectFace<AppsSettingsSectionInjected>>

interface RebuildState {
  readonly status: 'running' | 'complete' | 'failed'
  readonly result?: AppRebuildResult
  readonly error?: string
}

interface CreatorState {
  readonly status: 'running' | 'failed'
  readonly error?: string
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function AppsSettingsSection({ close, renderSlot, t, openCreator }: AppsSettingsSectionProps): ReactNode {
  const [apps, setApps] = useState<readonly AppSettingsDescriptor[]>()
  const [loadError, setLoadError] = useState<string>()
  const [rebuilds, setRebuilds] = useState<Readonly<Record<string, RebuildState>>>({})
  const [creators, setCreators] = useState<Readonly<Record<string, CreatorState>>>({})

  useEffect(() => {
    let active = true
    void listApps().then(
      value => {
        if (!active) return
        setApps(value)
        setLoadError(undefined)
      },
      error => {
        if (!active) return
        setApps([])
        setLoadError(messageOf(error))
      },
    )
    return () => { active = false }
  }, [])

  if (t === undefined) return null

  const rebuild = (app: AppSettingsDescriptor): void => {
    setRebuilds(previous => ({ ...previous, [app.id]: { status: 'running' } }))
    void rebuildApp(app.id).then(
      result => {
        setRebuilds(previous => ({ ...previous, [app.id]: { status: 'complete', result } }))
        void listApps().then(setApps).catch(() => {})
      },
      error => {
        setRebuilds(previous => ({
          ...previous,
          [app.id]: { status: 'failed', error: messageOf(error) },
        }))
      },
    )
  }

  const launchCreator = (app: AppSettingsDescriptor): void => {
    if (openCreator === undefined) return
    setCreators(previous => ({ ...previous, [app.id]: { status: 'running' } }))
    void openCreator(app.id).then(
      () => { close() },
      error => {
        setCreators(previous => ({
          ...previous,
          [app.id]: { status: 'failed', error: messageOf(error) },
        }))
      },
    )
  }

  return (
    <section className={css.surface}>
      <header className={css.heading}>
        <h2>{t('title')}</h2>
        <p>{t('subtitle')}</p>
      </header>
      {apps === undefined ? <p className={css.empty}>{t('loading')}</p> : null}
      {loadError === undefined ? null : (
        <div className={css.error} role="alert"><strong>{t('loadFailed')}</strong><br />{loadError}</div>
      )}
      {apps?.length === 0 && loadError === undefined ? <p className={css.empty}>{t('empty')}</p> : null}
      <div className={css.list}>
        {apps?.map(app => {
          const state = rebuilds[app.id]
          const running = state?.status === 'running'
          const creator = creators[app.id]
          const openingCreator = creator?.status === 'running'
          return (
            <article className={css.card} key={app.id}>
              <header className={css.cardHeader}>
                <div>
                  <h3>{app.title}</h3>
                  <code>{app.packageName}</code>
                </div>
                <Button
                  variant="outline"
                  disabled={openCreator === undefined || openingCreator}
                  title={t('vibeCodingHint')}
                  onClick={() => { launchCreator(app) }}
                >{openingCreator ? t('openingCreator') : t('vibeCoding')}</Button>
              </header>
              <div className={css.settings}>
                {creator?.status === 'failed' ? (
                  <div className={css.error} role="alert"><strong>{t('creatorFailed')}</strong><br />{creator.error}</div>
                ) : null}
                <h4>{t('appSettings')}</h4>
                {renderSlot('settings.apps.item', { app }, { only: app.id })}
                <div className={css.rebuildArea}>
                  {!app.rebuildAvailable ? (
                    <p className={css.reason}>{app.rebuildReason ?? t('rebuildUnavailable')}</p>
                  ) : null}
                  {state?.status === 'complete' && state.result !== undefined ? (
                    <div className={css.success} role="status">
                      <strong>{t('rebuildComplete')} · {(state.result.durationMs / 1000).toFixed(2)}s</strong>
                      <span>{t(state.result.hostReloaded ? 'hostReloaded' : 'hostNotReloaded')}</span>
                      {state.result.buildLog.length === 0 ? null : (
                        <details><summary>{t('buildLog')}</summary><pre>{state.result.buildLog}</pre></details>
                      )}
                    </div>
                  ) : null}
                  {state?.status === 'failed' ? (
                    <div className={css.error} role="alert"><strong>{t('rebuildFailed')}</strong><br />{state.error}</div>
                  ) : null}
                  <div className={css.rebuildFooter}>
                    <div className={css.rebuildCopy}>
                      <strong>{t('bunBuilder')}</strong>
                      <span>{t('rebuildHint')}</span>
                    </div>
                    <Button
                      variant="outline"
                      disabled={!app.rebuildAvailable || running}
                      title={app.rebuildAvailable ? t('rebuildWithBun') : (app.rebuildReason ?? t('rebuildUnavailable'))}
                      onClick={() => { rebuild(app) }}
                    >{running ? t('rebuilding') : t('rebuildWithBun')}</Button>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
