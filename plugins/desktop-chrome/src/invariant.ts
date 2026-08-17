/** Companion name exposed for Harness package discovery. */
export const name = 'openworkbuddy-desktop-chrome-invariant'

/** The browser-only layout replacement owns no host services. */
export const inject: readonly string[] = []

/** No host-side invariant is required for desktop presentation. */
export function apply(): void {}
