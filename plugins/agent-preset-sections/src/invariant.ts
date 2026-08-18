/** Companion name exposed for Harness package discovery. */
export const name = 'deepdeck-agent-preset-sections-invariant'

/** The presentation-only companion owns no host services. */
export const inject: readonly string[] = []

/** No host-side invariant is required for a DOM presentation enhancement. */
export function apply(): void {}
