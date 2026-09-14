import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './workspace-toggle.module.css'

/** Match the canonical right sidebar's expand and collapse controls. */
export function BlankWorkspaceButton({ open, label }: { open: () => void; label: string }) {
  return <button type="button" className={css.button}
    aria-expanded={false} aria-label={label} title={label} data-deepdeck-workspace-open onClick={open}>
    <IconPanelLeftOutline16 className={css.icon} />
  </button>
}
