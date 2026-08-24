import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Button,
  IconPlusOutline16,
  Input,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  PropsRenderSlots,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  AppCreateResult,
  AppInstallPreview,
  AppInstallResult,
  AppRebuildResult,
  AppSettingsDescriptor,
  AppUninstallResult,
} from '../contracts.js'
import type {} from '../app-settings-contract.js'
import {
  createApp,
  discardAppInstall,
  installApp,
  listApps,
  previewAppInstall,
  rebuildApp,
  restartForApps,
  uninstallApp,
} from './apps-api.js'
import type { AppSettingsLocaleKey } from './locales.js'
import css from './AppsSettingsSection.module.css'

export interface AppsSettingsSectionInjected {
  readonly t: (key: AppSettingsLocaleKey) => string
  readonly openCreator: (appId: string) => Promise<void>
  readonly dispatchUpdate: (appId: string) => Promise<void>
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

type InstallState =
  | { readonly status: 'idle' }
  | { readonly status: 'previewing' }
  | { readonly status: 'ready'; readonly preview: AppInstallPreview }
  | { readonly status: 'installing'; readonly preview: AppInstallPreview }
  | { readonly status: 'complete'; readonly result: AppInstallResult }
  | { readonly status: 'failed'; readonly error: string }

type UninstallState =
  | { readonly status: 'confirming' }
  | { readonly status: 'running' }
  | { readonly status: 'complete'; readonly result: AppUninstallResult }
  | { readonly status: 'failed'; readonly error: string }

type CreateState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'complete'; readonly result: AppCreateResult }
  | { readonly status: 'failed'; readonly error: string }

const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u

function suggestedAppId(title: string): string {
  const value = title
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 64)
    .replaceAll(/-+$/gu, '')
  return value || 'my-app'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function AppsSettingsSection({ close, renderSlot, t, openCreator, dispatchUpdate }: AppsSettingsSectionProps): ReactNode {
  const [apps, setApps] = useState<readonly AppSettingsDescriptor[]>()
  const [loadError, setLoadError] = useState<string>()
  const [rebuilds, setRebuilds] = useState<Readonly<Record<string, RebuildState>>>({})
  const [creators, setCreators] = useState<Readonly<Record<string, CreatorState>>>({})
  const [updates, setUpdates] = useState<Readonly<Record<string, CreatorState>>>({})
  const [installSource, setInstallSource] = useState('')
  const [installation, setInstallation] = useState<InstallState>({ status: 'idle' })
  const [uninstalls, setUninstalls] = useState<Readonly<Record<string, UninstallState>>>({})
  const [restartState, setRestartState] = useState<'idle' | 'running' | 'failed'>('idle')
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createId, setCreateId] = useState('')
  const [createIdEdited, setCreateIdEdited] = useState(false)
  const [creation, setCreation] = useState<CreateState>({ status: 'idle' })

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

  useEffect(() => {
    if (!createOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // The parent Settings surface also listens on document. Keep one Escape
      // scoped to this nested dialog instead of closing both layers at once.
      event.stopImmediatePropagation()
      if (creation.status !== 'running') setCreateOpen(false)
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => { document.removeEventListener('keydown', onKeyDown, { capture: true }) }
  }, [createOpen, creation.status])

  if (t === undefined) return null

  const previewInstall = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (installSource.trim().length === 0 || installation.status === 'previewing' || installation.status === 'installing') return
    if (installation.status === 'ready') void discardAppInstall(installation.preview.previewId).catch(() => {})
    setInstallation({ status: 'previewing' })
    void previewAppInstall(installSource).then(
      preview => { setInstallation({ status: 'ready', preview }) },
      error => { setInstallation({ status: 'failed', error: messageOf(error) }) },
    )
  }

  const confirmInstall = (preview: AppInstallPreview): void => {
    setInstallation({ status: 'installing', preview })
    void installApp(preview.previewId).then(
      result => {
        setInstallation({ status: 'complete', result })
        void listApps().then(setApps).catch(() => {})
      },
      error => { setInstallation({ status: 'failed', error: messageOf(error) }) },
    )
  }

  const resetInstall = (): void => {
    if (installation.status === 'ready') void discardAppInstall(installation.preview.previewId).catch(() => {})
    setInstallation({ status: 'idle' })
  }

  const restart = (): void => {
    setRestartState('running')
    void restartForApps().catch(() => { setRestartState('failed') })
  }

  const openCreate = (): void => {
    setCreateTitle('')
    setCreateId('')
    setCreateIdEdited(false)
    setCreation({ status: 'idle' })
    setRestartState('idle')
    setCreateOpen(true)
  }

  const closeCreate = (): void => {
    if (creation.status !== 'running') setCreateOpen(false)
  }

  const createNewApp = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const appId = createId.trim().toLowerCase()
    const title = createTitle.trim()
    if (title.length === 0 || !APP_ID_PATTERN.test(appId) || creation.status === 'running') return
    setCreation({ status: 'running' })
    void createApp(appId, title).then(
      result => { setCreation({ status: 'complete', result }) },
      error => { setCreation({ status: 'failed', error: messageOf(error) }) },
    )
  }

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

  const launchUpdate = (app: AppSettingsDescriptor): void => {
    if (dispatchUpdate === undefined) return
    setUpdates(previous => ({ ...previous, [app.id]: { status: 'running' } }))
    void dispatchUpdate(app.id).then(
      () => { close() },
      error => {
        setUpdates(previous => ({
          ...previous,
          [app.id]: { status: 'failed', error: messageOf(error) },
        }))
      },
    )
  }

  const requestUninstall = (app: AppSettingsDescriptor): void => {
    const state = uninstalls[app.id]
    if (state?.status !== 'confirming') {
      setUninstalls(previous => ({ ...previous, [app.id]: { status: 'confirming' } }))
      return
    }
    setUninstalls(previous => ({ ...previous, [app.id]: { status: 'running' } }))
    void uninstallApp(app.id).then(
      result => {
        setUninstalls(previous => ({ ...previous, [app.id]: { status: 'complete', result } }))
        void listApps().then(setApps).catch(() => {})
      },
      error => {
        setUninstalls(previous => ({
          ...previous,
          [app.id]: { status: 'failed', error: messageOf(error) },
        }))
      },
    )
  }

  return (
    <section className={css.surface}>
      <header className={css.heading}>
        <div>
          <h2>{t('title')}</h2>
          <p>{t('subtitle')}</p>
        </div>
        <Button
          variant="primary"
          icon={<IconPlusOutline16 size={16} />}
          onClick={openCreate}
        >{t('newApp')}</Button>
      </header>
      <Modal
        open={createOpen}
        onClose={closeCreate}
        title={t('createTitle')}
        closeLabel={t('cancel')}
        description={t('createDescription')}
        footer={creation.status === 'complete' ? (
          <div className={css.modalActions}>
            <Button variant="ghost" onClick={closeCreate}>{t('close')}</Button>
            <Button variant="primary" disabled={restartState === 'running'} onClick={restart}>
              {restartState === 'running' ? t('restarting') : t('restartNow')}
            </Button>
          </div>
        ) : (
          <div className={css.modalActions}>
            <Button variant="ghost" disabled={creation.status === 'running'} onClick={closeCreate}>{t('cancel')}</Button>
            <Button
              type="submit"
              form="deepdeck-create-app-form"
              variant="primary"
              disabled={createTitle.trim().length === 0 || !APP_ID_PATTERN.test(createId.trim().toLowerCase()) || creation.status === 'running'}
            >{creation.status === 'running' ? t('creating') : t('createApp')}</Button>
          </div>
        )}
      >
        {creation.status === 'complete' ? (
          <div className={css.createResult} role="status">
            <strong>{t('createComplete')} · {creation.result.title}</strong>
            <span>{t('createdSource')}: <code>{creation.result.sourceDirectory}</code></span>
            <span>{t('restartRequired')}</span>
            {restartState === 'failed' ? <span className={css.inlineError}>{t('restartFailed')}</span> : null}
          </div>
        ) : (
          <form id="deepdeck-create-app-form" className={css.createForm} onSubmit={createNewApp}>
            <label htmlFor="deepdeck-create-app-title">{t('appName')}</label>
            <Input
              id="deepdeck-create-app-title"
              autoFocus
              maxLength={120}
              value={createTitle}
              placeholder={t('appNamePlaceholder')}
              disabled={creation.status === 'running'}
              onChange={event => {
                const title = event.currentTarget.value
                setCreateTitle(title)
                if (!createIdEdited) setCreateId(title.trim().length === 0 ? '' : suggestedAppId(title))
                if (creation.status === 'failed') setCreation({ status: 'idle' })
              }}
            />
            <label htmlFor="deepdeck-create-app-id">{t('appId')}</label>
            <Input
              id="deepdeck-create-app-id"
              maxLength={64}
              value={createId}
              placeholder="my-app"
              spellCheck={false}
              autoCapitalize="none"
              disabled={creation.status === 'running'}
              aria-describedby="deepdeck-create-app-id-hint"
              onChange={event => {
                setCreateIdEdited(true)
                setCreateId(event.currentTarget.value.toLowerCase())
                if (creation.status === 'failed') setCreation({ status: 'idle' })
              }}
            />
            <p id="deepdeck-create-app-id-hint" className={css.fieldHint}>{t('appIdHint')}</p>
            {creation.status === 'failed' ? (
              <div className={css.error} role="alert"><strong>{t('createFailed')}</strong><br />{creation.error}</div>
            ) : null}
          </form>
        )}
      </Modal>
      <section className={css.installArea} aria-busy={installation.status === 'previewing' || installation.status === 'installing'}>
        <div className={css.installHeading}>
          <div>
            <h3>{t('installTitle')}</h3>
            <p>{t('installHint')}</p>
          </div>
          <code>~/DeepDeck/Plugins</code>
        </div>
        <form className={css.installForm} onSubmit={previewInstall}>
          <input
            type="text"
            value={installSource}
            aria-label={t('installSource')}
            placeholder={t('installPlaceholder')}
            disabled={installation.status === 'previewing' || installation.status === 'installing'}
            onChange={event => { setInstallSource(event.target.value) }}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={installSource.trim().length === 0 || installation.status === 'previewing' || installation.status === 'installing'}
          >{installation.status === 'previewing' ? t('probing') : t('probeInstall')}</Button>
        </form>
        {installation.status === 'ready' || installation.status === 'installing' ? (
          <div className={css.installPreview}>
            <dl>
              <div><dt>{t('detectedSource')}</dt><dd>{t(installation.preview.sourceKind)}</dd></div>
              <div><dt>{t('detectedApp')}</dt><dd>{installation.preview.title}</dd></div>
              <div><dt>{t('detectedPackage')}</dt><dd><code>{installation.preview.packageName}@{installation.preview.version}</code></dd></div>
              <div><dt>{t('profileAction')}</dt><dd>{t(installation.preview.profileAction === 'repair' ? 'profileRepair' : 'profileInstall')}</dd></div>
              <div><dt>{t('pluginDirectory')}</dt><dd><code>{installation.preview.sourceDirectory}</code></dd></div>
              <div><dt>{t('buildScript')}</dt><dd><code>{installation.preview.buildScript}</code></dd></div>
            </dl>
            <p className={css.installWarning}>{t(installation.preview.profileAction === 'repair' ? 'repairWarning' : 'installWarning')}</p>
            <div className={css.installActions}>
              <Button variant="ghost" disabled={installation.status === 'installing'} onClick={resetInstall}>{t('cancel')}</Button>
              <Button
                variant="primary"
                disabled={installation.status === 'installing'}
                onClick={() => { confirmInstall(installation.preview) }}
              >{installation.status === 'installing'
                  ? t(installation.preview.profileAction === 'repair' ? 'repairing' : 'installing')
                  : t(installation.preview.profileAction === 'repair' ? 'confirmRepair' : 'confirmInstall')}</Button>
            </div>
          </div>
        ) : null}
        {installation.status === 'complete' ? (
          <div className={css.success} role="status">
            <strong>{t(installation.result.profileAction === 'repair' ? 'repairComplete' : 'installComplete')} · {installation.result.title}</strong>
            <span>{t('sourceReady')}: <code>{installation.result.sourceDirectory}</code></span>
            <span>{t('restartRequired')}</span>
            <div className={css.resultActions}>
              <Button variant="outline" onClick={() => { setInstallation({ status: 'idle' }) }}>{t('installAnother')}</Button>
              <Button variant="primary" disabled={restartState === 'running'} onClick={restart}>
                {restartState === 'running' ? t('restarting') : t('restartNow')}
              </Button>
            </div>
          </div>
        ) : null}
        {installation.status === 'failed' ? (
          <div className={css.error} role="alert"><strong>{t('installFailed')}</strong><br />{installation.error}</div>
        ) : null}
        {restartState === 'failed' ? <div className={css.error} role="alert">{t('restartFailed')}</div> : null}
      </section>
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
          const update = updates[app.id]
          const dispatchingUpdate = update?.status === 'running'
          const uninstall = uninstalls[app.id]
          const uninstalling = uninstall?.status === 'running'
          return (
            <article className={css.card} key={app.id}>
              <header className={css.cardHeader}>
                <div>
                  <h3>{app.title}</h3>
                  <code>{app.packageName}</code>
                </div>
                <Button
                  variant="outline"
                  disabled={openCreator === undefined || openingCreator || dispatchingUpdate || running || uninstalling}
                  title={t('vibeCodingHint')}
                  onClick={() => { launchCreator(app) }}
                >{openingCreator ? t('openingCreator') : t('vibeCoding')}</Button>
              </header>
              <div className={css.settings}>
                {creator?.status === 'failed' ? (
                  <div className={css.error} role="alert"><strong>{t('creatorFailed')}</strong><br />{creator.error}</div>
                ) : null}
                {update?.status === 'failed' ? (
                  <div className={css.error} role="alert"><strong>{t('updateFailed')}</strong><br />{update.error}</div>
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
                  {uninstall?.status === 'confirming' ? (
                    <div className={css.uninstallWarning} role="status">
                      <strong>{t('confirmUninstallTitle')}</strong>
                      <span>{t('confirmUninstallHint')}</span>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setUninstalls(previous => {
                            const next = { ...previous }
                            delete next[app.id]
                            return next
                          })
                        }}
                      >{t('cancel')}</Button>
                    </div>
                  ) : null}
                  {uninstall?.status === 'complete' ? (
                    <div className={css.success} role="status">
                      <strong>{t('uninstallComplete')}</strong>
                      <span>{t('sourceRetained')}: <code>{uninstall.result.sourceDirectory}</code></span>
                      <span>{t('restartRequired')}</span>
                      <div className={css.resultActions}>
                        <Button variant="primary" disabled={restartState === 'running'} onClick={restart}>
                          {restartState === 'running' ? t('restarting') : t('restartNow')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {uninstall?.status === 'failed' ? (
                    <div className={css.error} role="alert"><strong>{t('uninstallFailed')}</strong><br />{uninstall.error}</div>
                  ) : null}
                  <div className={css.rebuildFooter}>
                    <div className={css.rebuildCopy}>
                      <strong>{t('bunBuilder')}</strong>
                      <span>{t('rebuildHint')}</span>
                    </div>
                    <div className={css.appActions}>
                      <Button
                        variant="outline"
                        disabled={dispatchUpdate === undefined || !app.updateAvailable || openingCreator || dispatchingUpdate || running || uninstalling}
                        title={app.updateAvailable ? t('updateWithAgentHint') : (app.updateReason ?? t('updateUnavailable'))}
                        onClick={() => { launchUpdate(app) }}
                      >{dispatchingUpdate ? t('dispatchingUpdate') : t('updateWithAgent')}</Button>
                      <Button
                        variant="outline"
                        disabled={!app.rebuildAvailable || openingCreator || dispatchingUpdate || running || uninstalling}
                        title={app.rebuildAvailable ? t('rebuildWithBun') : (app.rebuildReason ?? t('rebuildUnavailable'))}
                        onClick={() => { rebuild(app) }}
                      >{running ? t('rebuilding') : t('rebuildWithBun')}</Button>
                      <Button
                        className={uninstall?.status === 'confirming' ? css.dangerAction : undefined}
                        variant="outline"
                        disabled={!app.uninstallAvailable || openingCreator || dispatchingUpdate || running || uninstalling}
                        title={app.uninstallAvailable ? t('uninstall') : (app.uninstallReason ?? t('uninstallUnavailable'))}
                        onClick={() => { requestUninstall(app) }}
                      >{uninstalling
                          ? t('uninstalling')
                          : uninstall?.status === 'confirming' ? t('confirmUninstall') : t('uninstall')}</Button>
                    </div>
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
