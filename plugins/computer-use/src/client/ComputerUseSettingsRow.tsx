import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComputerUseInjected } from './ComputerUseToggle.tsx'
import css from './computer-use.module.css'

type ComputerUseSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'deepdeck.computer-use'>
  & InjectFace<ComputerUseInjected>

export function ComputerUseSettingsRow({ setEnabled, t, useComputerUse }: ComputerUseSettingsRowProps) {
  const state = useComputerUse(snapshot => snapshot)
  const [pending, setPending] = useState(false)
  const enabled = state.value?.enabled !== false
  const disabled = pending || state.status !== 'ready' || !state.writable

  return (
    <div className={css.settingsRow}>
      <div className={css.settingsText}>
        <div className={css.settingsTitle}>{t('title')}</div>
        <div className={css.settingsDescription}>{t('description')}</div>
      </div>
      <button
        type="button"
        role="switch"
        className={css.switch}
        data-enabled={enabled ? 'true' : 'false'}
        aria-label={t('title')}
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => {
          setPending(true)
          void setEnabled(!enabled).finally(() => { setPending(false) })
        }}
      >
        <span className={css.switchThumb} />
      </button>
    </div>
  )
}
