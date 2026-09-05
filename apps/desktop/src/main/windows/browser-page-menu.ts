import type { BrowserPageMenuAction, BrowserPageMenuLabels } from '../../../../../plugins/browser/src/native-contract.js'

export const PAGE_MENU_LABELS: BrowserPageMenuLabels = {
  copy: 'Copy', cut: 'Cut', paste: 'Paste', selectAll: 'Select all', undo: 'Undo', redo: 'Redo',
  searchSelection: 'Search Google for selection', askAgent: 'Add to Site Agent',
  openLink: 'Open link in new tab', copyLink: 'Copy link address',
  saveLink: 'Save link as…', openImage: 'Open image in new tab', copyImage: 'Copy image', saveImage: 'Save image as…',
  back: 'Back', forward: 'Forward', reload: 'Reload', inspect: 'Inspect',
}
export interface PageMenuContext {
  selectionText: string
  isEditable: boolean
  linkURL: string
  mediaType?: string
  srcURL?: string
  canGoBack: boolean
  canGoForward: boolean
  editFlags: { canCopy: boolean; canCut: boolean; canPaste: boolean; canSelectAll: boolean; canUndo: boolean; canRedo: boolean }
}
export type PageMenuItem = { type: 'separator' } | { action: BrowserPageMenuAction; label: string; enabled: boolean; accelerator?: string }

/** Native menu policy, populated with the Browser plugin’s localized labels. */
export function pageMenu(context: PageMenuContext, labels = PAGE_MENU_LABELS): PageMenuItem[] {
  const items: PageMenuItem[] = []
  const add = (action: BrowserPageMenuAction, enabled = true, accelerator?: string) => items.push({ action, label: labels[action], enabled, ...(accelerator ? { accelerator } : {}) })
  const separate = () => { if (items.length && !('type' in items[items.length - 1]!)) items.push({ type: 'separator' }) }
  const selected = context.selectionText.trim().length > 0
  if (context.isEditable) {
    add('undo', context.editFlags.canUndo, 'CommandOrControl+Z')
    add('redo', context.editFlags.canRedo, 'CommandOrControl+Shift+Z')
    separate()
    add('cut', context.editFlags.canCut, 'CommandOrControl+X')
    add('copy', context.editFlags.canCopy, 'CommandOrControl+C')
    add('paste', context.editFlags.canPaste, 'CommandOrControl+V')
  } else if (selected) add('copy', context.editFlags.canCopy, 'CommandOrControl+C')
  if (selected) {
    separate()
    add('searchSelection')
    add('askAgent')
  }
  if (context.linkURL) {
    separate()
    if (/^(https?:\/\/|blob:https?:\/\/)/i.test(context.linkURL)) { add('openLink'); add('saveLink') }
    add('copyLink')
  }
  if (context.mediaType === 'image') {
    separate()
    add('copyImage')
    if (/^(https?:\/\/|blob:https?:\/\/)/i.test(context.srcURL ?? '')) { add('openImage'); add('saveImage') }
  }
  if (!selected && !context.isEditable && !context.linkURL && context.mediaType !== 'image') {
    add('back', context.canGoBack)
    add('forward', context.canGoForward)
    add('reload', true, 'CommandOrControl+R')
  }
  separate()
  add('selectAll', context.editFlags.canSelectAll, 'CommandOrControl+A')
  separate()
  add('inspect')
  return items
}
