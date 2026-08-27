import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionHandle, IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import {
  createSnapshotStore,
  type ClientContext,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button,
  IconAgentPresetOutline16,
  IconCloseOutline16,
  IconDataOutline16,
  IconPersonalizationOutline16,
  IconSettingsOutline14,
  IconSettingsOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  resolveSlotLabel,
  type HostObservable,
  type InjectFace,
  type PropsLocale,
  type PropsRenderSlots,
  type PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import shellCss from '../../../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css'
import chromeCss from '../../../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/chrome.module.css'
import generalCss from '../../../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/GeneralSection.module.css'
import actionCss from '../../../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsDocumentAction.module.css'

export const DESKTOP_SETTINGS_LOCALE = 'deepdeck.desktop.settings' as const

const zh = {
  trigger: '设置',
  title: '设置',
  close: '关闭',
  openDocument: '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
} as const

const en = {
  trigger: 'Settings',
  title: 'Settings',
  close: 'Close',
  openDocument: 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
} satisfies Record<keyof typeof zh, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.desktop.settings': keyof typeof zh
  }
}

interface SettingsSectionRow {
  readonly id: string
  readonly order: number
  readonly label: string
}

interface SettingsOnboardingStep {
  readonly id: string
  readonly order: number
}

interface SettingsShellInjected {
  readonly hooks: {
    readonly sections: HostObservable<readonly SettingsSectionRow[]>
    readonly onboardingSteps: HostObservable<readonly SettingsOnboardingStep[]>
  }
}

type SettingsShellProps = PropsRuntime<'sidebar.settings'>
  & PropsRenderSlots<
    | 'settings.trigger'
    | 'settings.header'
    | 'settings.action'
    | 'settings.close'
    | 'settings.section'
    | 'settings.onboarding'
  >
  & InjectFace<SettingsShellInjected>

/** Storefront glyph reserved for the Store settings section. */
export function StoreOutlineIcon({ size = 16, className }: {
  readonly size?: number
  readonly className?: string | undefined
}): React.JSX.Element {
  return (
    <svg
      data-icon="deepdeck-store"
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2.25 6.25v6.5c0 .55.45 1 1 1h9.5c.55 0 1-.45 1-1v-6.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 5.75 2.75 2.5h10.5l1.25 3.25a2 2 0 0 1-3.25 1.55A2 2 0 0 1 8 7.3a2 2 0 0 1-3.25 0A2 2 0 0 1 1.5 5.75Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 13.75v-3.5h4v3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function navIcon(id: string): React.JSX.Element {
  if (id === 'store') return <StoreOutlineIcon className={shellCss.navIcon} />
  if (id === 'models') return <IconDataOutline16 className={shellCss.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={shellCss.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={shellCss.navIcon} size={16} />
  return <IconSettingsOutline16 className={shellCss.navIcon} size={16} />
}

function SettingsPanel({ rows, renderSlot, activeId, onSelect, onClose }: {
  readonly rows: readonly SettingsSectionRow[]
  readonly renderSlot: SettingsShellProps['renderSlot']
  readonly activeId: string | undefined
  readonly onSelect: (id: string) => void
  readonly onClose: () => void
}): React.JSX.Element {
  const active = rows.find(row => row.id === activeId)?.id ?? rows[0]?.id
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={shellCss.overlay} role="presentation">
      <div className={shellCss.mask} aria-hidden="true" onClick={onClose} />
      <div className={shellCss.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <nav className={shellCss.nav}>
          <div className={shellCss.navTitle} id={titleId}>{renderSlot('settings.header', {})}</div>
          <div className={shellCss.navList}>
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                className={row.id === active ? `${shellCss.navCell} ${shellCss.active}` : shellCss.navCell}
                aria-current={row.id === active ? 'true' : undefined}
                onClick={() => { onSelect(row.id) }}
              >
                {navIcon(row.id)}
                <span className={shellCss.navLabel}>{row.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className={shellCss.content}>
          <div className={shellCss.header}>
            <div className={shellCss.actions}>{renderSlot('settings.action', {})}</div>
            <button ref={closeButton} type="button" className={shellCss.close} onClick={onClose}>
              <IconCloseOutline16 size={14} />
              <span className={shellCss.hiddenLabel}>{renderSlot('settings.close', {})}</span>
            </button>
          </div>
          <div className={shellCss.options}>
            {active !== undefined && renderSlot('settings.section', { close: onClose }, { only: active })}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsShell(props: SettingsShellProps): React.JSX.Element {
  const { wide, useSections, useOnboardingSteps, useSessions, renderSlot } = props
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const rows = useSections(snapshot => snapshot)
  const onboardingSteps = useOnboardingSteps(snapshot => snapshot)
  const onboardingActive = useSessions(state =>
    state.phase === 'ready'
    && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined
  const close = useCallback(() => {
    setOpen(false)
    setActiveId(undefined)
  }, [])
  const openSection = useCallback((id: string) => {
    setActiveId(id)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!onboardingActive) setCompletedOnboarding(new Set())
  }, [onboardingActive])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding(previous => previous.has(id) ? previous : new Set([...previous, id]))
  }, [])

  return (
    <>
      <button
        type="button"
        className={wide ? shellCss.trigger : `${shellCss.trigger} ${shellCss.rail}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(true) }}
      >
        {renderSlot('settings.trigger', { wide })}
      </button>
      {open && (
        <SettingsPanel
          rows={rows}
          renderSlot={renderSlot}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={close}
        />
      )}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}

function TriggerContent({ wide, t }: PropsRuntime<'settings.trigger'> & PropsLocale<typeof DESKTOP_SETTINGS_LOCALE>) {
  return (
    <>
      {wide ? <IconSettingsOutline16 size={16} /> : <IconSettingsOutline14 size={18} />}
      {wide && <span className={chromeCss.triggerLabel}>{t('trigger')}</span>}
    </>
  )
}

function HeaderContent({ t }: PropsRuntime<'settings.header'> & PropsLocale<typeof DESKTOP_SETTINGS_LOCALE>) {
  return <>{t('title')}</>
}

function CloseLabel({ t }: PropsRuntime<'settings.close'> & PropsLocale<typeof DESKTOP_SETTINGS_LOCALE>) {
  return <>{t('close')}</>
}

function GeneralSection({ renderSlot }: PropsRuntime<'settings.section'> & PropsRenderSlots<'settings.general.item'>) {
  return <div className={generalCss.section}>{renderSlot('settings.general.item', {})}</div>
}

interface SettingsDocumentState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  opening: boolean
  error: string | null
}

class SettingsDocumentStore {
  readonly store: SnapshotStore<SettingsDocumentState> = createSnapshotStore({
    status: 'idle', opening: false, error: null,
  })

  private following: (() => void) | undefined

  constructor(
    private readonly api: Pick<IApiClient, 'settings'>,
    private readonly describeFace: SettingsDescribeFace,
  ) {}

  async load(): Promise<void> {
    this.following ??= this.describeFace.subscribe(() => { this.derive() })
    this.store.update(state => {
      state.status = 'loading'
      state.error = null
    })
    await this.describeFace.ensure()
    this.derive()
  }

  async open(): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.status !== 'ready' || current.opening) return
    this.store.update(state => {
      state.opening = true
      state.error = null
    })
    try {
      const response = await this.api.settings.openDocument({})
      if (!response.result.ok) throw new Error(response.result.error.message)
    } catch (error) {
      this.store.update(state => { state.error = error instanceof Error ? error.message : String(error) })
    } finally {
      this.store.update(state => { state.opening = false })
    }
  }

  dispose(): void {
    this.following?.()
    this.following = undefined
  }

  private derive(): void {
    const mirrored = this.describeFace.getSnapshot()
    if (mirrored.view === undefined) {
      if (mirrored.error !== null) {
        this.store.update(state => {
          state.status = 'unavailable'
          state.error = mirrored.error
        })
      }
      return
    }
    this.store.update(state => {
      state.status = mirrored.view?.hasDocument === true ? 'ready' : 'unavailable'
      state.error = null
    })
  }
}

interface SettingsDocumentInjected {
  readonly controller: SettingsDocumentStore
  readonly hooks: { readonly snapshot: SettingsDocumentStore['store'] }
}

function SettingsDocumentAction({ controller, useSnapshot, t }:
PropsRuntime<'settings.action'> & PropsLocale<typeof DESKTOP_SETTINGS_LOCALE> & InjectFace<SettingsDocumentInjected>): ReactNode {
  const state = useSnapshot(snapshot => snapshot)
  useEffect(() => { void controller.load() }, [controller])
  if (state.status !== 'ready') return null
  return (
    <div className={actionCss.action}>
      {state.error === null ? null : <span className={actionCss.error} role="alert">{t('openDocument.error')}</span>}
      <Button variant="outline" size="sm" disabled={state.opening} onClick={() => { void controller.open() }}>
        {t('openDocument')}
      </Button>
    </div>
  )
}

/** Replace the stock settings owner with DeepDeck's icon-aware Cordis shell. */
export function installDesktopSettingsShell(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(DESKTOP_SETTINGS_LOCALE, { zh, en }),
    'deepdeck desktop: settings dictionaries',
  )
  const t = ctx.locale.bind(DESKTOP_SETTINGS_LOCALE)
  const connection = ctx.get('connection') as ConnectionHandle
  const documentController = connection.isLoopback
    ? new SettingsDocumentStore(connection.api, ctx.settingsScope.describe())
    : undefined
  ctx.effect(() => () => { documentController?.dispose() }, 'deepdeck desktop: settings document action')

  let rowsVersion = -1
  let rowsRevision = -1
  let rows: readonly SettingsSectionRow[] = []
  let onboardingVersion = -1
  let onboardingSteps: readonly SettingsOnboardingStep[] = []
  const shellInjected = (): SettingsShellInjected => ({
    hooks: {
      sections: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.section')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== rowsVersion || revision !== rowsRevision) {
            rowsVersion = version
            rowsRevision = revision
            rows = ctx.slots.entries('settings.section').map(entry => ({
              id: entry.options.id ?? '',
              order: entry.options.order ?? 0,
              label: resolveSlotLabel(entry.options.label) ?? '',
            })).sort((left, right) => left.order - right.order)
          }
          return rows
        },
        subscribe: listener => {
          const offLedger = ctx.slots.subscribe('settings.section', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
      onboardingSteps: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.onboarding')
          if (version !== onboardingVersion) {
            onboardingVersion = version
            onboardingSteps = ctx.slots.entries('settings.onboarding').map(entry => ({
              id: entry.options.id ?? '',
              order: entry.options.order ?? 0,
            })).sort((left, right) => left.order - right.order)
          }
          return onboardingSteps
        },
        subscribe: listener => ctx.slots.subscribe('settings.onboarding', listener),
      },
    },
  })

  ctx.slots.inject('sidebar.settings', () => ctx.slots.register({
    name: 'sidebar.settings',
    children: {
      'settings.trigger': { kind: 'single', scope: 'root' },
      'settings.header': { kind: 'single', scope: 'root' },
      'settings.action': { kind: 'list', scope: 'root' },
      'settings.close': { kind: 'single', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' },
      'settings.onboarding': { kind: 'list', scope: 'root' },
    },
    inject: shellInjected,
  }, SettingsShell))
  ctx.slots.inject('settings.trigger', () => ctx.slots.register({
    name: 'settings.trigger', locale: DESKTOP_SETTINGS_LOCALE,
  }, TriggerContent))
  ctx.slots.inject('settings.header', () => ctx.slots.register({
    name: 'settings.header', locale: DESKTOP_SETTINGS_LOCALE,
  }, HeaderContent))
  if (documentController !== undefined) {
    ctx.slots.inject('settings.action', () => ctx.slots.register({
      name: 'settings.action',
      id: 'open-document',
      order: 0,
      locale: DESKTOP_SETTINGS_LOCALE,
      inject: () => ({ controller: documentController, hooks: { snapshot: documentController.store } }),
    }, SettingsDocumentAction))
  }
  ctx.slots.inject('settings.close', () => ctx.slots.register({
    name: 'settings.close', locale: DESKTOP_SETTINGS_LOCALE,
  }, CloseLabel))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'general',
    order: 0,
    label: () => t('general.nav'),
    locale: DESKTOP_SETTINGS_LOCALE,
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  }, GeneralSection))
}
