import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Welcome acknowledgement stays with DeepDeck's replacement settings shell. */
export const Config = z.object({ welcomeNoticeVersion: z.string().volatile() })

export function apply(ctx: Context): void {
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
