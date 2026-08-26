import type { Context } from '@deepseek-ai/cordis'

export const name = 'deepdeck-computer-use-invariant'
export const inject = ['deepdeckComputerUse']

/** The management service must expose absolute bundled runtime paths. */
export function apply(ctx: Context): void {
  const runtime = ctx.deepdeckComputerUse
  if (!runtime.root || !runtime.launcher || !runtime.agentTempDirectory) {
    throw new Error('deepdeck computer-use runtime paths are unavailable')
  }
}
