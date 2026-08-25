import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComputerUseSettings } from '../contracts.ts'
import type { ComputerUseLocaleKey } from './locales.ts'
import { ComputerUseIcon } from './ComputerUseIcon.tsx'
import css from './computer-use.module.css'

export interface ComputerUseInjected {
  hooks: {
    computerUse: SettingsScope<ComputerUseSettings>
  }
  setEnabled: (enabled: boolean) => Promise<void>
}

type ComputerUseToggleProps =
  PropsRuntime<'conversation.input.left'>
  & PropsLocale<'deepdeck.computer-use'>
  & InjectFace<ComputerUseInjected>

function labelOf(
  state: SettingsScopeSnapshot<ComputerUseSettings>,
  t: (key: ComputerUseLocaleKey) => string,
): string {
  if (state.status === 'loading') return t('loading')
  if (state.status === 'unavailable') return t('unavailable')
  return t(state.value?.enabled === false ? 'disabled' : 'enabled')
}

export function ComputerUseToggle({ setEnabled, t, useComputerUse }: ComputerUseToggleProps) {
  const state = useComputerUse(snapshot => snapshot)
  const [pending, setPending] = useState(false)
  const enabled = state.value?.enabled !== false
  const disabled = pending || state.status !== 'ready' || !state.writable
  const label = labelOf(state, t)

  const keepComposerFocus = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }

  return (
    <Tooltip label={label} side="top" delayMs={500}>
      <button
        type="button"
        className={css.composerButton}
        data-enabled={enabled ? 'true' : 'false'}
        aria-label={label}
        aria-pressed={enabled}
        disabled={disabled}
        onMouseDown={keepComposerFocus}
        onClick={() => {
          setPending(true)
          void setEnabled(!enabled).finally(() => { setPending(false) })
        }}
      >
        <ComputerUseIcon className={css.icon} />
      </button>
    </Tooltip>
  )
}
