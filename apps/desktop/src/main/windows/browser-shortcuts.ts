interface BrowserKey {
  type: string; key: string; code?: string
  meta?: boolean; control?: boolean; shift?: boolean; alt?: boolean
}
export type BrowserShortcut =
  | { action: 'new' | 'reopen' | 'close' | 'reload' | 'reloadIgnoringCache' | 'address' | 'find' | 'findNext' | 'findPrevious' | 'back' | 'forward' | 'stop' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'print' | 'save' | 'downloads' | 'devtools' | 'fullscreen' }
  | { action: 'cycle'; offset: number }
  | { action: 'select'; index: number }

// Shared by the shell and every native website, including login popups.
export function browserShortcut(input: BrowserKey, platform: string): BrowserShortcut | undefined {
  if (input.type !== 'keyDown') return
  const key = input.key.toLowerCase()
  const mac = platform === 'darwin'
  const primary = mac ? input.meta && !input.control : input.control && !input.meta
  if (!input.meta && !input.alt && key === 'f5') return { action: input.control || input.shift ? 'reloadIgnoringCache' : 'reload' }
  if (!input.meta && !input.control && !input.alt) {
    if (key === 'f3') return { action: input.shift ? 'findPrevious' : 'findNext' }
    if (!input.shift && key === 'escape') return { action: 'stop' }
    if (!input.shift && key === 'f12') return { action: 'devtools' }
    if (!mac && !input.shift && key === 'f11') return { action: 'fullscreen' }
  }
  if (!mac && input.alt && !input.control && !input.meta && !input.shift && ['arrowleft', 'arrowright', 'left', 'right'].includes(key)) return { action: key.endsWith('left') ? 'back' : 'forward' }
  if (mac && input.meta && input.control && !input.alt && !input.shift && key === 'f') return { action: 'fullscreen' }
  if (primary && key === 'i' && (mac ? input.alt && !input.shift : input.shift && !input.alt)) return { action: 'devtools' }
  if (!mac && input.alt && !input.control && !input.meta && !input.shift && key === 'd') return { action: 'address' }
  if (mac && primary && input.alt && !input.shift && key === 'f') return { action: 'address' }
  if (primary && !input.alt) {
    if (!input.shift && key === 'k') return { action: 'address' }
    if (key === 'g') return { action: input.shift ? 'findPrevious' : 'findNext' }
    if (key === '+' || key === '=' || input.code === 'NumpadAdd') return { action: 'zoomIn' }
    if (key === '-' || key === '_' || input.code === 'NumpadSubtract') return { action: 'zoomOut' }
    if (!input.shift && key === '0') return { action: 'zoomReset' }
    if (key === 'j' && (mac ? input.shift : !input.shift)) return { action: 'downloads' }
    if (!input.shift && key === 'p') return { action: 'print' }
    if (!input.shift && key === 's') return { action: 'save' }
    if (mac && !input.shift && (key === '[' || key === ']')) return { action: key === '[' ? 'back' : 'forward' }
  }
  if (input.control && !input.meta && !input.alt) {
    if (key === 'tab') return { action: 'cycle', offset: input.shift ? -1 : 1 }
    if (!input.shift && (key === 'pageup' || key === 'pagedown')) return { action: 'cycle', offset: key === 'pageup' ? -1 : 1 }
    if (!mac && !input.shift && key === 'f4') return { action: 'close' }
  }
  if (mac && primary && input.alt && !input.shift && (key === 'arrowleft' || key === 'arrowright' || key === 'left' || key === 'right')) {
    return { action: 'cycle', offset: key.endsWith('left') ? -1 : 1 }
  }
  if (!primary || input.alt) return
  if (key === 't') return { action: input.shift ? 'reopen' : 'new' }
  if (key === 'r') return { action: input.shift ? 'reloadIgnoringCache' : 'reload' }
  if (mac && input.shift && (input.code === 'BracketLeft' || input.code === 'BracketRight' || key === '{' || key === '}')) {
    return { action: 'cycle', offset: input.code === 'BracketLeft' || key === '{' ? -1 : 1 }
  }
  if (input.shift) return
  if (key === 'w') return { action: 'close' }
  if (key === 'l') return { action: 'address' }
  if (key === 'f') return { action: 'find' }
  if (/^[1-9]$/.test(key)) return { action: 'select', index: key === '9' ? -1 : Number(key) - 1 }
}
