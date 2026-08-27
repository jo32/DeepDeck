import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  ONBOARDING_SETTINGS_NAMESPACE,
  OnboardingSettingsSchema,
  type DesktopChromeHostContext,
} from './index.ts'

describe('desktop chrome Host settings contract', () => {
  it('restores the welcome acknowledgement namespace removed with the stock settings shell', () => {
    const register = vi.fn()

    apply({ settings: { register } } as DesktopChromeHostContext)

    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith(
      ONBOARDING_SETTINGS_NAMESPACE,
      OnboardingSettingsSchema,
    )
    expect(ONBOARDING_SETTINGS_NAMESPACE).toBe('ui-onboarding')
  })

  it('accepts a persisted welcome notice version and rejects the wrong type', () => {
    expect(OnboardingSettingsSchema({ welcomeNoticeVersion: '2026-08-13.1' }))
      .toEqual({ welcomeNoticeVersion: '2026-08-13.1' })
    expect(() => OnboardingSettingsSchema({ welcomeNoticeVersion: 1 } as never)).toThrow()
  })
})
