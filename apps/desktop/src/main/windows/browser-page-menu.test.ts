import { describe, expect, it } from 'vitest'
import { pageMenu, type PageMenuContext } from './browser-page-menu.js'

const context: PageMenuContext = { selectionText: '', linkURL: '', isEditable: false, canGoBack: false, canGoForward: false,
  editFlags: { canCopy: true, canCut: false, canPaste: false, canSelectAll: true, canUndo: false, canRedo: false } }

describe('Browser native page menu', () => {
  it('offers copy, search and Agent only for an actual selection', () => {
    expect(pageMenu({ ...context, selectionText: 'Selected text' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'copy', enabled: true }),
      expect.objectContaining({ action: 'searchSelection' }), expect.objectContaining({ action: 'askAgent' }),
    ]))
    expect(pageMenu(context).some(item => 'action' in item && item.action === 'askAgent')).toBe(false)
    expect(pageMenu(context)).toContainEqual(expect.objectContaining({ action: 'back', enabled: false }))
  })
  it('respects native editing capabilities and does not offer to execute script links', () => {
    expect(pageMenu({ ...context, isEditable: true })).toContainEqual(expect.objectContaining({ action: 'paste', enabled: false }))
    const menu = pageMenu({ ...context, linkURL: 'javascript:alert(1)' })
    expect(menu).toContainEqual(expect.objectContaining({ action: 'copyLink' }))
    expect(menu.some(item => 'action' in item && item.action === 'openLink')).toBe(false)
    expect(pageMenu({ ...context, linkURL: 'https://example.com' })).toContainEqual(expect.objectContaining({ action: 'openLink' }))
  })
})
