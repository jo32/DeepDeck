import { IconNewChatOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './desktop-chrome.module.css'

/** Shared new-session glyph used by both expanded and collapsed chrome. */
export function NewSessionIcon(): React.JSX.Element {
  return <IconNewChatOutline16 className={css.newSessionIcon} size={14} />
}
