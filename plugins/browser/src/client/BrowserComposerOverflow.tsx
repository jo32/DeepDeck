import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { BrowserIcon } from './icons.js'
import { BROWSER_LOCALE } from './locales.js'
import css from './composer-overflow.module.css'

interface ComposerBoundary {
  panel: RefObject<HTMLElement | null>
  compact: boolean
  modelDestination: HTMLSpanElement | null
  setModelDestination: (element: HTMLSpanElement | null) => void
}
const BrowserComposerBoundary = createContext<ComposerBoundary | null>(null)

export function BrowserComposerProvider({ panel, children }: { panel: RefObject<HTMLElement | null>; children: ReactNode }) {
  const [compact, setCompact] = useState(true)
  const [modelDestination, setModelDestination] = useState<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const update = () => { setCompact(element.getBoundingClientRect().width < 560) }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => { observer.disconnect() }
  }, [panel])
  return <BrowserComposerBoundary.Provider value={{ panel, compact, modelDestination, setModelDestination }}>{children}</BrowserComposerBoundary.Provider>
}

/** The original model seat retains its locked prop, directory and selection actions. */
export function BrowserComposerModel({ children }: { children: ReactNode }) {
  const boundary = useContext(BrowserComposerBoundary)
  if (!boundary?.compact) return children
  return boundary.modelDestination ? createPortal(children, boundary.modelDestination) : null
}
export const COMPOSER_CONTROLS = 'deepdeck.browser.composer.controls' as const
export const COMPOSER_CONTROL_LABELS = {
  'openai-codex-fast-mode': 'fastMode',
  'openai-codex-quota': 'codexUsage',
  'deepdeck-session-metrics': 'sessionMetrics',
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'deepdeck.browser.composer.controls': { kind: 'list'; scope: 'session'; owner: SlotMap['conversation.input.right']['owner'] }
  }
}

type Props = PropsRuntime<'conversation.input.right'> & PropsLocale<typeof BROWSER_LOCALE>
  & PropsRenderSlots<typeof COMPOSER_CONTROLS>

/** Measures only the plugin-owned content box, including controls that render null. */
function Control({ children, label, compact, id, onAvailability }: {
  children: ReactNode; label: string; compact: boolean; id: string; onAvailability(id: string, value: boolean): void
}) {
  const content = useRef<HTMLSpanElement>(null)
  const [available, setAvailable] = useState(false)
  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    const update = () => {
      const value = element.getBoundingClientRect().width > 0
      setAvailable(value)
      onAvailability(id, value)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => { observer.disconnect() }
  }, [id, onAvailability])
  return <div className={css.control} data-control={id} data-available={available} data-compact={compact}>
    {compact && <span className={css.label}>{label}</span>}
    <span ref={content} className={css.content}>{children}</span>
  </div>
}

/** Reuses the original plugin controls; the message editor and its state stay resident. */
export function BrowserComposerOverflow({ session, input, sessionId, renderSlot, t }: Props) {
  const boundary = useContext(BrowserComposerBoundary)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [bottom, setBottom] = useState(0)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const onAvailability = useCallback((controlId: string, value: boolean) => {
    setAvailability(previous => previous[controlId] === value ? previous : { ...previous, [controlId]: value })
  }, [])
  const available = Object.values(availability).some(Boolean)
  const panel = boundary?.panel.current
  const compact = boundary?.compact ?? true

  useEffect(() => { setOpen(false) }, [compact, sessionId])
  useEffect(() => { if (!available) setOpen(false) }, [available])
  useEffect(() => { if (open) popup.current?.focus() }, [open])
  useLayoutEffect(() => {
    if (!open || !panel) return
    const update = () => {
      const button = trigger.current
      if (!button || button.getBoundingClientRect().width === 0) { setOpen(false); return }
      setBottom(panel.getBoundingClientRect().bottom - button.getBoundingClientRect().top + 8)
    }
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    if (trigger.current) observer.observe(trigger.current)
    update()
    return () => { observer.disconnect() }
  }, [open, panel, input])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || trigger.current?.contains(event.target) || popup.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const controls = Object.entries(COMPOSER_CONTROL_LABELS).map(([controlId, key]) =>
    <Control key={controlId} id={controlId} label={t(key)} compact={compact} onAvailability={onAvailability}>
      {renderSlot(COMPOSER_CONTROLS, { session, input }, { only: controlId })}
    </Control>)

  if (!compact || !panel) return <div className={css.inline} data-browser-composer-utilities>{controls}</div>
  return <>
    <button ref={trigger} type="button" hidden={!available} className={css.trigger} data-deepdeck-composer-control aria-label={t('moreComposer')}
      title={t('moreComposer')} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => { setOpen(value => !value) }}><BrowserIcon name="more" /></button>
    {createPortal(<div ref={popup} id={id} role="dialog" tabIndex={-1} aria-label={t('moreComposer')} aria-hidden={!open}
      className={css.popup} data-open={open} data-browser-composer-utilities
      style={{ bottom }}>
      <div className={css.heading}>{t('moreComposer')}<button type="button" className={css.trigger}
        aria-label={t('dismiss')} onClick={() => { setOpen(false); trigger.current?.focus() }}><BrowserIcon name="close" /></button></div>
      <div className={css.controls}>
        <Control id="model" label={t('modelSettings')} compact onAvailability={onAvailability}>
          <span ref={boundary?.setModelDestination} className={css.modelDestination} />
        </Control>
        {controls}
      </div>
      <p className={css.empty}>{t('composerStatusEmpty')}</p>
    </div>, panel)}
  </>
}
