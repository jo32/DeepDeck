/** Companion name exposed for Harness package discovery. */
export const name = 'deepdeck-home-hero-invariant'

/** The presentation-only companion owns no host services. */
export const inject: readonly string[] = []

/** No host-side invariant is required. */
export function apply(): void {}
