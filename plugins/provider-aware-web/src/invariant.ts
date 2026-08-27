import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-web'

export const name = 'deepdeck-provider-aware-web-invariant'
export const inject = ['web']

/** Fail startup if the replacement does not expose the stable web service seam. */
export function apply(ctx: Context): void {
  if (
    typeof ctx.web.registerSearchProvider !== 'function'
    || typeof ctx.web.registerFetchProvider !== 'function'
    || typeof ctx.web.search !== 'function'
    || typeof ctx.web.fetch !== 'function'
  ) {
    throw new Error('DeepDeck provider-aware web service is incomplete')
  }
}
