import { describe, expect, it } from 'vitest'
import { tabMenu } from './tab-menu.js'
import { en, zh } from './locales.js'
import type { BrowserSnapshot } from '../native-contract.js'

describe('tab menu', () => {
  const snapshot = { tabs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], activeTabId: 'a' } as BrowserSnapshot
  it('targets the right-clicked background tab and localizes its actions', () => {
    const menu = tabMenu(snapshot, 'b', key => zh[key])
    expect(menu).toContainEqual({ label: zh.closeOtherTabs, command: { action: 'tab.closeOthers', tabId: 'b' }, enabled: true })
    expect(menu).toContainEqual({ label: zh.newTabRight, command: { action: 'tab.open', afterTabId: 'b' } })
  })
  it('disables inapplicable close/reopen actions and ignores vanished tabs', () => {
    const single = { ...snapshot, tabs: [snapshot.tabs[0]!] }
    const menu = tabMenu(single, 'a', key => en[key])
    for (const action of ['tab.closeOthers', 'tab.closeRight', 'tab.reopen', 'tab.move']) {
      expect(menu.filter(item => 'command' in item && item.command.action === action).every(item => 'enabled' in item && item.enabled === false)).toBe(true)
    }
    expect(tabMenu(snapshot, 'c', key => en[key])).toContainEqual({ label: en.closeTabsRight, command: { action: 'tab.closeRight', tabId: 'c' }, enabled: false })
    expect(tabMenu({ ...single, canReopenClosedTab: true }, 'a', key => en[key]).at(-1)).toMatchObject({ enabled: true })
    expect(tabMenu(snapshot, 'closed', key => en[key])).toEqual([])
  })
})
