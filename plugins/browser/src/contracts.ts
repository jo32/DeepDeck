export type { BrowserTool, BrowserTab, BrowserSnapshot, BrowserNativeCommand, BrowserTarget, WebMCPScript } from './native-contract.js'
export const BROWSER_API_PATH = '/api/deepdeck/browser'
export const BROWSER_SURFACE = 'browser'
export type BrowserMode = 'use' | 'builder'
export interface BrowserSite {
  id: string
  origin: string
  title: string
  workspacePath: string
  workspaceId: string
  sessionId?: string
  boundTabId?: string
  mode: BrowserMode
  activeRevision?: string
  revisions: string[]
  enabled: boolean
}
export interface BrowserBinding {
  siteId: string
  sessionId: string
  tabId: string
  mode: BrowserMode
}
export interface BrowserState {
  native: import('./native-contract.js').BrowserSnapshot
  sites: BrowserSite[]
  available: boolean
}
/** Same-origin Client API actions. Native page scripting is exposed only as Builder tools. */
export type BrowserClientAction =
  | { action: 'state' }
  | { action: 'open'; url?: string }
  | { action: 'command'; command: import('./native-contract.js').BrowserNativeCommand }
  | { action: 'site.resolve'; tabId: string }
  | { action: 'site.bind'; siteId: string; sessionId: string; tabId: string; mode: BrowserMode }
  | { action: 'site.mode'; siteId: string; mode: BrowserMode }
  | { action: 'site.toggle'; siteId: string; enabled: boolean }
  | { action: 'site.rollback'; siteId: string; revision: string }
