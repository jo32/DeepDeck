import type { BrowserSnapshot, BrowserTabMenuItem } from '../native-contract.js'
import type { BrowserLocaleKey } from './locales.js'

// The plugin owns the menu's content; Electron only presents the system menu
// above the native website view and dispatches its bounded tab commands.
export function tabMenu(snapshot: BrowserSnapshot, tabId: string, t: (key: BrowserLocaleKey) => string): BrowserTabMenuItem[] {
  const index = snapshot.tabs.findIndex(tab => tab.id === tabId)
  if (index < 0) return []
  return [
    { label: t('newTabRight'), command: { action: 'tab.open', afterTabId: tabId } },
    { type: 'separator' },
    { label: t('reload'), command: { action: 'tab.reload', tabId }, accelerator: 'CommandOrControl+R' },
    { label: t(snapshot.tabs[index]?.muted ? 'unmuteTab' : 'muteTab'), command: { action: 'tab.mute', tabId, muted: !snapshot.tabs[index]?.muted } },
    { label: t('moveTabLeft'), command: { action: 'tab.move', tabId, index: index - 1 }, enabled: index > 0 },
    { label: t('moveTabRight'), command: { action: 'tab.move', tabId, index: index + 1 }, enabled: index < snapshot.tabs.length - 1 },
    { label: t('duplicateTab'), command: { action: 'tab.duplicate', tabId } },
    { type: 'separator' },
    { label: t('closeTab'), command: { action: 'tab.close', tabId }, accelerator: 'CommandOrControl+W' },
    { label: t('closeOtherTabs'), command: { action: 'tab.closeOthers', tabId }, enabled: snapshot.tabs.length > 1 },
    { label: t('closeTabsRight'), command: { action: 'tab.closeRight', tabId }, enabled: index < snapshot.tabs.length - 1 },
    { type: 'separator' },
    { label: t('reopenTab'), command: { action: 'tab.reopen' }, enabled: snapshot.canReopenClosedTab === true, accelerator: 'CommandOrControl+Shift+T' },
  ]
}
