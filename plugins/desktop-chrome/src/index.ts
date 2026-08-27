import z from '@deepseek-ai/schemastery'

/** Namespace consumed by the stock welcome-notice client contribution. */
export const ONBOARDING_SETTINGS_NAMESPACE = 'ui-onboarding'

export interface OnboardingSettings {
  /** Last internal-testing notice version acknowledged by the user. */
  welcomeNoticeVersion?: string
}

/** Keep the Host half of the replaced settings-general plugin's contract. */
export const OnboardingSettingsSchema: z<OnboardingSettings> = z.object({
  welcomeNoticeVersion: z.string(),
})

export interface DesktopChromeHostContext {
  readonly settings: {
    register<T>(namespace: string, schema: z<T>): unknown
  }
}

export const inject = ['settings']

/** Register the durable state needed by the stock welcome-notice step. */
export function apply(ctx: DesktopChromeHostContext): void {
  ctx.settings.register(ONBOARDING_SETTINGS_NAMESPACE, OnboardingSettingsSchema)
}
