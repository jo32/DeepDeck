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
  provenance?: import('./webmcp-package.js').GitHubSource
  upstream?: import('./webmcp-package.js').GitHubSource
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
  | { action: 'site.webmcp.files'; siteId: string }
  | { action: 'site.files.list'; siteId: string }
  | { action: 'site.bind'; siteId: string; sessionId: string; tabId: string; mode: BrowserMode }
  | { action: 'site.mode'; siteId: string; mode: BrowserMode }
  | { action: 'site.toggle'; siteId: string; enabled: boolean }
  | { action: 'site.rollback'; siteId: string; revision: string }
  | { action: 'market.directory' }
  | { action: 'market.catalog'; origin: string }
  | ({ action: 'market.prepare' } & import('./market-link.js').MarketPackageRef)
  | { action: 'market.preview'; siteId: string; repository: string; manifestPath?: string; commit?: string; repositoryId?: number }
  | { action: 'market.install'; siteId: string; token: string; openSite?: boolean }
  | { action: 'market.files.list'; siteId: string; draft?: string; path?: string }
  | { action: 'market.files.read'; siteId: string; draft: string; path: string }
  | { action: 'market.export'; siteId: string; revision: string }
  | { action: 'project.state' | 'project.start' | 'project.finish' | 'project.abort'; siteId: string }
  | { action: 'project.preview'; siteId: string; commit?: string }
  | { action: 'project.merge' | 'project.cancel'; siteId: string; token: string }
