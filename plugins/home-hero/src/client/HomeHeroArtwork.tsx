import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import SpiderOrbThree from './SpiderOrbThree.tsx'
import css from './home-hero.module.css'

export type HomeHeroKey = 'characterLabel'

export interface HomeHeroArtworkProps {
  readonly session: ConversationSnapshot
  readonly t: TranslateNS<'homeHero'>
}

/** Product-owned new-session artwork, mounted through conversation.input.dock. */
export function HomeHeroArtwork({ session, t }: HomeHeroArtworkProps) {
  if (session.composerPhase !== 'blank') return null

  return (
    <div className={css.artwork} data-openworkbuddy-home-hero="">
      <div className={css.heroTitleMask} aria-hidden="true" />
      <div className={css.mascot} aria-label={t('characterLabel')}>
        <SpiderOrbThree
          appearance="spider"
          expression="auto"
          expressionEpoch={0}
          repositionSignal={0}
        />
      </div>
    </div>
  )
}
