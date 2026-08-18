import { useEffect, useRef, useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import SpiderOrbThree from './SpiderOrbThree.tsx'
import type { OrbExpression } from './orb-expressions.ts'
import css from './home-hero.module.css'

export type HomeHeroKey = 'characterLabel'
export const TYPING_IDLE_MS = 1_000

export interface HomeHeroArtworkProps {
  readonly session: ConversationSnapshot
  readonly input: {
    readonly draftRev: number
  }
  readonly t: TranslateNS<'homeHero'>
}

/** Product-owned new-session artwork, mounted through conversation.input.dock. */
export function HomeHeroArtwork({ session, input, t }: HomeHeroArtworkProps) {
  const [presentation, setPresentation] = useState<{
    expression: OrbExpression
    epoch: number
  }>({ expression: 'auto', epoch: 0 })
  const previousDraftRev = useRef(input.draftRev)

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

  if (session.composerPhase !== 'blank') return null

  return (
    <div className={css.artwork} data-deepdeck-home-hero="">
      <div className={css.heroTitleMask} aria-hidden="true" />
      <div className={css.mascot} aria-label={t('characterLabel')}>
        <SpiderOrbThree
          appearance="alien"
          expression={presentation.expression}
          expressionEpoch={presentation.epoch}
          repositionSignal={0}
        />
      </div>
    </div>
  )
}
