import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import SpiderOrbThree, { type OrbActionMode } from './SpiderOrbThree.tsx'
import type { OrbExpression } from './orb-expressions.ts'
import css from './home-hero.module.css'

export type HomeHeroKey = 'characterLabel'
export const TYPING_IDLE_MS = 1_000
export const HERO_LAUNCH_MS = 540
export const HERO_RETURN_MS = 620
export const DOCKED_ORB_WIDTH = 48
export const DOCKED_ORB_HEIGHT = 60
export const DOCKED_ORB_INSET_X = 6
export const DOCKED_ORB_INSET_Y = 12

interface LaunchRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface HeroLaunchGeometry {
  readonly start: LaunchRect
  readonly translateX: number
  readonly translateY: number
  readonly scale: number
}

export interface HeroReturnGeometry {
  readonly start: LaunchRect
  readonly target: LaunchRect
  readonly translateX: number
  readonly translateY: number
  readonly scaleX: number
  readonly scaleY: number
}

type HeroMotion =
  | { readonly kind: 'resting' }
  | {
    readonly kind: 'launching'
    readonly geometry: HeroLaunchGeometry
    readonly target: LaunchRect
    readonly epoch: number
    readonly started: boolean
  }
  | {
    readonly kind: 'returning'
    readonly geometry: HeroReturnGeometry
    readonly epoch: number
    readonly started: boolean
  }
  | { readonly kind: 'docked'; readonly target: LaunchRect | null; readonly epoch: number }

type OrbStyle = CSSProperties & {
  readonly '--deepdeck-hero-left': string
  readonly '--deepdeck-hero-top': string
  readonly '--deepdeck-hero-width': string
  readonly '--deepdeck-hero-height': string
  readonly '--deepdeck-hero-x'?: string
  readonly '--deepdeck-hero-y'?: string
  readonly '--deepdeck-hero-scale'?: string
  readonly '--deepdeck-hero-landing-squash'?: string
  readonly '--deepdeck-hero-return-x'?: string
  readonly '--deepdeck-hero-return-y'?: string
  readonly '--deepdeck-hero-return-scale-x'?: string
  readonly '--deepdeck-hero-return-scale-y'?: string
}

const RESTING: HeroMotion = { kind: 'resting' }

// Session-scoped slots remount when the selected session id changes. Preserve
// only the last plugin-owned visual rect so the next blank session can pick up
// the return flight from the exact dock position without querying Harness DOM.
let pendingReturnOrigin: LaunchRect | null = null

function rememberReturnOrigin(rect: LaunchRect): void {
  pendingReturnOrigin = { ...rect }
}

function takeReturnOrigin(): LaunchRect | null {
  const origin = pendingReturnOrigin
  pendingReturnOrigin = null
  return origin
}

function launchRect(node: HTMLElement | null): LaunchRect | null {
  if (node === null) return null
  const rect = node.getBoundingClientRect()
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0) return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * Add room for the liquid Doing dots, then optically inset the orb from the
 * composer's bottom-right edge while leaving the resident 34px action as its
 * semantic hit target.
 */
export function resolveDockedOrbRect(target: LaunchRect): LaunchRect {
  return {
    left: target.left + (target.width - DOCKED_ORB_WIDTH) / 2 - DOCKED_ORB_INSET_X,
    top: target.top + (target.height - DOCKED_ORB_HEIGHT) / 2 - DOCKED_ORB_INSET_Y,
    width: DOCKED_ORB_WIDTH,
    height: DOCKED_ORB_HEIGHT,
  }
}

/** Land the scaled hero precisely on the resolved compact orb frame. */
export function resolveHeroLaunch(start: LaunchRect, target: LaunchRect): HeroLaunchGeometry {
  const scale = target.width / start.width
  return {
    start,
    translateX: target.left + target.width / 2 - start.left - start.width * scale / 2,
    translateY: target.top + target.height / 2 - start.top - start.height * scale / 2,
    scale,
  }
}

/** Expand the compact orb back into the blank composer's natural hero box. */
export function resolveHeroReturn(start: LaunchRect, target: LaunchRect): HeroReturnGeometry {
  return {
    start,
    target,
    // The return layer is destination-sized from its first frame. Apply this
    // inverse transform to make it visually occupy the compact start rect,
    // then animate to identity without resizing the WebGL renderer.
    translateX: start.left - target.left,
    translateY: start.top - target.top,
    scaleX: start.width / target.width,
    scaleY: start.height / target.height,
  }
}

function orbStyle(rect: LaunchRect, geometry?: HeroLaunchGeometry): OrbStyle {
  return {
    '--deepdeck-hero-left': `${rect.left}px`,
    '--deepdeck-hero-top': `${rect.top}px`,
    '--deepdeck-hero-width': `${rect.width}px`,
    '--deepdeck-hero-height': `${rect.height}px`,
    ...(geometry === undefined ? {} : {
      '--deepdeck-hero-x': `${geometry.translateX}px`,
      '--deepdeck-hero-y': `${geometry.translateY}px`,
      '--deepdeck-hero-scale': String(geometry.scale),
      '--deepdeck-hero-landing-squash': String(geometry.scale * .92),
    }),
  }
}

function returnOrbStyle(geometry: HeroReturnGeometry): OrbStyle {
  return {
    ...orbStyle(geometry.target),
    '--deepdeck-hero-return-x': `${geometry.translateX}px`,
    '--deepdeck-hero-return-y': `${geometry.translateY}px`,
    '--deepdeck-hero-return-scale-x': String(geometry.scaleX),
    '--deepdeck-hero-return-scale-y': String(geometry.scaleY),
  }
}

function sameRect(left: LaunchRect | null, right: LaunchRect) {
  return left !== null
    && Math.abs(left.left - right.left) < .25
    && Math.abs(left.top - right.top) < .25
    && Math.abs(left.width - right.width) < .25
    && Math.abs(left.height - right.height) < .25
}

export interface HomeHeroArtworkProps {
  readonly session: ConversationSnapshot
  readonly input: {
    readonly draft: string
    readonly imageIds: readonly unknown[]
    readonly draftRev: number
    readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  }
  readonly t: TranslateNS<'homeHero'>
}

/** One persistent Alien Orb, mounted through the session-scoped input dock. */
export function HomeHeroArtwork({ session, input, t }: HomeHeroArtworkProps) {
  const [presentation, setPresentation] = useState<{
    expression: OrbExpression
    epoch: number
  }>({ expression: 'auto', epoch: 0 })
  const [rendererReady, setRendererReady] = useState(false)
  const [instantReveal, setInstantReveal] = useState(
    () => session.composerPhase !== 'blank' || pendingReturnOrigin !== null,
  )
  const [motion, setMotion] = useState<HeroMotion>(() =>
    session.composerPhase === 'blank'
      ? RESTING
      : { kind: 'docked', target: null, epoch: 0 })
  const previousDraftRev = useRef(input.draftRev)
  const previousComposerPhase = useRef(session.composerPhase)
  const lastBlankRect = useRef<LaunchRect | null>(null)
  const artworkRef = useRef<HTMLDivElement>(null)
  const mascotRef = useRef<HTMLDivElement>(null)
  const heroTargetRef = useRef<HTMLSpanElement>(null)
  const targetRef = useRef<HTMLSpanElement>(null)

  const readDockTarget = () => {
    const target = launchRect(targetRef.current)
    return target === null ? null : resolveDockedOrbRect(target)
  }

  const readHeroTarget = () => launchRect(heroTargetRef.current)
  const handleRendererReady = useCallback(() => { setRendererReady(true) }, [])

  // Publish the compact position before a session-key remount. The new blank
  // instance consumes it in its first layout pass and continues the motion.
  useLayoutEffect(() => {
    if (session.composerPhase === 'blank') return
    if (motion.kind === 'docked' && motion.target !== null) {
      rememberReturnOrigin(motion.target)
    }
  }, [motion, session.composerPhase])

  // Capture the transformed frame on phase exit/unmount as well, covering a
  // New Session click that lands during the short launch animation.
  useLayoutEffect(() => {
    if (session.composerPhase === 'blank') return
    return () => {
      const visibleRect = launchRect(mascotRef.current)
      if (visibleRect !== null) rememberReturnOrigin(visibleRect)
    }
  }, [session.composerPhase])

  // The composer changes posture during blank -> engaging. Freeze the last
  // hero rect for that commit, then measure only our own target marker.
  const arming = session.composerPhase === 'engaging'
    && previousComposerPhase.current === 'blank'
    && motion.kind === 'resting'
  const geometry = motion.kind === 'launching' ? motion.geometry : undefined
  const frozenStart = geometry?.start ?? (arming ? lastBlankRect.current : null)

  useLayoutEffect(() => {
    const phase = session.composerPhase
    const previous = previousComposerPhase.current
    previousComposerPhase.current = phase

    if (phase === 'blank') {
      const inheritedStart = pendingReturnOrigin
      const inheritedTarget = inheritedStart === null ? null : readHeroTarget()
      if (inheritedStart !== null && inheritedTarget !== null) {
        takeReturnOrigin()
        setInstantReveal(true)
        setMotion({
          kind: 'returning',
          geometry: resolveHeroReturn(inheritedStart, inheritedTarget),
          epoch: performance.now(),
          started: false,
        })
        return
      }

      if (previous !== 'blank' && motion.kind !== 'resting') {
        const start = motion.kind === 'docked'
          ? motion.target ?? launchRect(mascotRef.current)
          : launchRect(mascotRef.current)
        const target = readHeroTarget()
        const epoch = performance.now()
        setMotion(start === null || target === null
          ? RESTING
          : {
            kind: 'returning',
            geometry: resolveHeroReturn(start, target),
            epoch,
            started: false,
          })
        if (start !== null && target !== null) setInstantReveal(true)
        return
      }

      if (motion.kind === 'returning') return
      if (motion.kind !== 'resting') {
        setMotion(RESTING)
        return
      }

      const measure = () => {
        const rect = launchRect(mascotRef.current)
        if (rect !== null) lastBlankRect.current = rect
      }
      measure()
      window.addEventListener('resize', measure)
      const observer = typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure)
      if (artworkRef.current !== null) observer?.observe(artworkRef.current)
      if (mascotRef.current !== null) observer?.observe(mascotRef.current)

      return () => {
        window.removeEventListener('resize', measure)
        observer?.disconnect()
      }
    }

    if (previous === 'blank' && phase === 'engaging' && motion.kind === 'resting') {
      const start = lastBlankRect.current
      const target = readDockTarget()
      const epoch = performance.now()
      setMotion(start === null || target === null
        ? { kind: 'docked', target, epoch }
        : {
          kind: 'launching',
          geometry: resolveHeroLaunch(start, target),
          target,
          epoch,
          started: false,
        })
      return
    }

    // A very fast submit during the return animation prioritizes the user's
    // new turn and snaps back to the resident action seat.
    if (motion.kind === 'returning') {
      setMotion({ kind: 'docked', target: readDockTarget(), epoch: performance.now() })
      return
    }

    if (motion.kind === 'resting') {
      setMotion({ kind: 'docked', target: readDockTarget(), epoch: performance.now() })
    }
  }, [motion.kind, session.composerPhase])

  // In both directions, hold the inverse FLIP until Three has rendered and the
  // new composer posture has painted twice. The transition then starts on an
  // already-promoted compositor layer, away from layout and shader warm-up.
  const transitionStarted = (motion.kind === 'launching' || motion.kind === 'returning')
    && motion.started
  const transitionEpoch = motion.kind === 'launching' || motion.kind === 'returning'
    ? motion.epoch
    : 0
  useEffect(() => {
    if ((motion.kind !== 'launching' && motion.kind !== 'returning')
      || motion.started
      || !rendererReady) return

    const preparedKind = motion.kind
    const preparedEpoch = motion.epoch
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setMotion(current => (current.kind === preparedKind
          && current.epoch === preparedEpoch
          && !current.started)
          ? { ...current, started: true }
          : current)
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== 0) window.cancelAnimationFrame(secondFrame)
    }
  }, [motion.kind, rendererReady, transitionEpoch, transitionStarted])

  // Keep the compact frame centered when the window or composer geometry moves.
  useLayoutEffect(() => {
    if (session.composerPhase === 'blank') return

    const measure = () => {
      const target = readDockTarget()
      if (target === null) return
      setMotion(current => {
        if (current.kind === 'launching'
          || current.kind === 'returning'
          || current.kind === 'resting') return current
        return sameRect(current.target, target)
          ? current
          : { ...current, target }
      })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(measure)
    const targetParent = targetRef.current?.parentElement
    if (artworkRef.current !== null) observer?.observe(artworkRef.current)
    if (targetParent !== null && targetParent !== undefined) observer?.observe(targetParent)

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      observer?.disconnect()
    }
  }, [session.composerPhase])

  const finishLaunch = () => {
    setMotion(current => current.kind !== 'launching' || !current.started
      ? current
      : {
        kind: 'docked',
        target: readDockTarget() ?? current.target,
        epoch: current.epoch,
      })
  }

  const finishReturn = () => {
    setMotion(current => current.kind === 'returning' && current.started ? RESTING : current)
  }

  useEffect(() => {
    if (motion.kind !== 'launching' && motion.kind !== 'returning') return
    if (!motion.started) return
    const timer = window.setTimeout(
      motion.kind === 'launching' ? finishLaunch : finishReturn,
      (motion.kind === 'launching' ? HERO_LAUNCH_MS : HERO_RETURN_MS) + 120,
    )
    return () => { window.clearTimeout(timer) }
  }, [motion.kind, transitionStarted])

  useEffect(() => {
    if (session.composerPhase !== 'blank') {
      previousDraftRev.current = input.draftRev
      setPresentation(current => current.expression === 'auto'
        ? current
        : { expression: 'auto', epoch: performance.now() })
      return
    }

    if (previousDraftRev.current === input.draftRev) return
    previousDraftRev.current = input.draftRev
    setPresentation({ expression: 'doing', epoch: performance.now() })

    const idleTimer = window.setTimeout(() => {
      setPresentation({ expression: 'auto', epoch: performance.now() })
    }, TYPING_IDLE_MS)

    return () => { window.clearTimeout(idleTimer) }
  }, [input.draftRev, session.composerPhase])

  const motionName = session.composerPhase === 'blank'
    ? motion.kind === 'returning'
      ? motion.started ? 'returning' : 'return-preparing'
      : motion.kind === 'docked'
        ? 'return-armed'
        : motion.kind === 'launching'
          ? motion.started ? 'launching' : 'launch-preparing'
          : 'resting'
    : motion.kind === 'launching'
      ? motion.started ? 'launching' : 'launch-preparing'
      : arming ? 'armed' : 'docked'
  const dockTarget = motion.kind === 'docked' ? motion.target : null
  const style = motion.kind === 'returning'
    ? returnOrbStyle(motion.geometry)
    : frozenStart !== null
      ? orbStyle(frozenStart, geometry)
      : dockTarget === null ? undefined : orbStyle(dockTarget)
  const stops = Boolean(session.running && session.subagent === null)
  const heroFacing = motionName === 'resting'
    || motionName === 'return-armed'
    || motionName === 'return-preparing'
    || motionName === 'returning'
  const actionMode: OrbActionMode = heroFacing
    ? 'face'
    : stops || session.composerPhase === 'engaging' ? 'doing' : 'send'
  const expression: OrbExpression = motionName === 'resting'
    ? presentation.expression
    : actionMode === 'doing' ? 'doing' : 'neutral'
  const busy = input.phase === 'adjudicating' || input.phase === 'submitting'
  const empty = input.draft.trim() === '' && input.imageIds.length === 0
  const disabled = !stops && (session.removed || busy || empty)
  const accessible = motionName === 'resting'
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return
    if (motion.kind === 'launching') finishLaunch()
    if (motion.kind === 'returning') finishReturn()
  }

  return (
    <div
      ref={artworkRef}
      className={css.artwork}
      data-deepdeck-home-hero=""
      data-motion={motionName}
      data-action={actionMode}
    >
      <div className={css.heroTitleMask} aria-hidden="true" />
      <span
        ref={heroTargetRef}
        className={css.heroTarget}
        data-deepdeck-home-hero-resting-target=""
        aria-hidden="true"
      />
      <span className={css.sendTargetRail} aria-hidden="true">
        <span ref={targetRef} className={css.sendTarget} data-deepdeck-home-hero-target="">
          <span
            className={css.nativeActionCover}
            data-deepdeck-home-hero-native-cover=""
          />
        </span>
      </span>
      <div
        ref={mascotRef}
        className={css.mascot}
        data-deepdeck-home-hero-mascot=""
        data-motion={motionName}
        data-positioned={motionName !== 'docked' && motionName !== 'return-armed'
          ? 'true'
          : dockTarget !== null ? 'true' : 'false'}
        data-disabled={disabled ? 'true' : 'false'}
        style={style}
        aria-label={accessible ? t('characterLabel') : undefined}
        aria-hidden={accessible ? undefined : 'true'}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className={css.liquidBody}>
          <SpiderOrbThree
            appearance="alien"
            expression={expression}
            expressionEpoch={motion.kind === 'launching' || motion.kind === 'returning'
              ? motion.epoch
              : presentation.epoch}
            repositionSignal={motion.kind === 'launching' || motion.kind === 'returning'
              ? motion.epoch
              : 0}
            actionMode={actionMode}
            actionEpoch={0}
            compact={motionName === 'docked' || motionName === 'return-armed'}
            interactive={accessible}
            instantReveal={instantReveal}
            onReady={handleRendererReady}
          />
        </div>
      </div>
    </div>
  )
}
