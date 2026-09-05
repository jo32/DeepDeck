/** Shared type-only contract: neither side imports code from the other runtime. */
export interface BrowserTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  frameId: string
  documentId: string
  origin: string
  source: 'site' | 'deepdeck'
  revision?: string
}
export interface BrowserTab {
  id: string
  url: string
  origin: string
  title: string
  documentId: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  tools: BrowserTool[]
  zoomFactor?: number
  audible?: boolean
  muted?: boolean
  find?: { text: string; matches: number; activeMatch: number }
  favicon?: string
  error?: string
  webmcpError?: string
}
export interface BrowserDownload {
  id: string
  filename: string
  state: string
  paused?: boolean
  canResume?: boolean
  receivedBytes: number
  totalBytes: number
}
export interface BrowserSnapshot {
  open: boolean
  tabs: BrowserTab[]
  activeTabId?: string
  downloads: BrowserDownload[]
  canReopenClosedTab?: boolean
  selections?: BrowserSelection[]
  authentication?: BrowserAuthentication[]
}
export interface BrowserAuthentication { id: string; tabId: string; host: string; realm: string; isProxy: boolean }
/** User-requested excerpts, transient until inserted into the ordinary draft. */
export interface BrowserSelection extends BrowserTarget { id: string; text: string; url: string; title: string }
export type BrowserPageMenuAction = 'copy' | 'cut' | 'paste' | 'selectAll' | 'undo' | 'redo' | 'searchSelection' | 'askAgent' | 'openLink' | 'copyLink' | 'back' | 'forward' | 'reload' | 'inspect' | 'saveLink' | 'openImage' | 'copyImage' | 'saveImage'
export type BrowserPageMenuLabels = Record<BrowserPageMenuAction, string>
export interface BrowserTarget { tabId: string; documentId: string }
export interface BrowserDevToolsLease { id: string; wsEndpoint: string; token: string }
export interface WebMCPScript { origin: string; revision: string; source: string }
export interface WebMCPPageReceipt extends BrowserTarget {
  revision: string
  registered: string[]
  tools: BrowserTool[]
}
export interface WebMCPInstallReceipt {
  installed: true
  origin: string
  revision: string
  matched: number
  registered: number
  failed: number
  tabs: WebMCPPageReceipt[]
}
export interface BrowserScreenshot { image: string; documentId: string }
export interface BrowserInspection {
  documentId: string
  content: { title: string; url: string; text: string; elements: unknown[] }
  accessibility: unknown[]
  frames: { id: string; origin: string; parentId?: string }[]
  console: unknown[]
  tools: BrowserTool[]
}
export type BrowserTabCommand =
  | { action: 'tab.open'; url?: string; afterTabId?: string }
  | { action: 'tab.reopen' }
  | { action: 'tab.move'; tabId: string; index: number }
  | { action: 'tab.mute'; tabId: string; muted: boolean }
  | { action: 'tab.duplicate' | 'tab.closeOthers' | 'tab.closeRight' | 'tab.close' | 'tab.reload'; tabId: string }
export type BrowserTabMenuItem = { type: 'separator' } | {
  label: string; command: BrowserTabCommand; enabled?: boolean; accelerator?: string
}
export type BrowserNativeCommand =
  | BrowserTabCommand
  | { action: 'open'; shellUrl: string; url?: string }
  | { action: 'snapshot' }
  | { action: 'auth.respond'; id: string; credentials?: { username: string; password: string } }
  | { action: 'page.menu.configure'; labels: BrowserPageMenuLabels }
  | { action: 'page.selection.ack'; id: string }
  | { action: 'tab.menu'; items: BrowserTabMenuItem[]; x: number; y: number }
  | { action: 'tab.activate' | 'tab.close' | 'tab.back' | 'tab.forward' | 'tab.reload' | 'tab.stop'; tabId: string }
  | { action: 'tab.navigate'; tabId: string; url: string }
  | { action: 'layout'; top: number; right: number }
  | { action: 'find'; tabId: string; text: string; forward?: boolean; next?: boolean }
  | { action: 'tab.print' | 'tab.save' | 'tab.devtools' | 'tab.siteInfo'; tabId: string }
  | { action: 'window.fullscreen' }
  | { action: 'download.control'; id: string; operation: 'pause' | 'resume' | 'cancel' | 'open' | 'reveal' }
  | { action: 'zoom'; tabId: string; factor: number }
  | ({ action: 'devtools.open'; workspacePath: string } & BrowserTarget)
  | ({ action: 'devtools.begin'; leaseId: string } & BrowserTarget)
  | { action: 'devtools.close' | 'devtools.end'; leaseId: string }
  | ({ action: 'webmcp.call'; frameId: string; name: string; input: Record<string, unknown>; callId: string; revision?: string } & BrowserTarget)
  | { action: 'webmcp.cancel'; callId: string }
  | { action: 'webmcp.install'; script: WebMCPScript }
  | { action: 'webmcp.remove'; origin: string }
  | ({ action: 'page.inspect' | 'page.screenshot' | 'page.network' } & BrowserTarget)
  | ({ action: 'page.evaluate'; expression: string } & BrowserTarget)
  | ({ action: 'page.interact'; kind: 'click' | 'type' | 'key' | 'scroll'; x?: number; y?: number; text?: string; key?: string; deltaX?: number; deltaY?: number } & BrowserTarget)
export interface BrowserNativeRequest { type: 'deepdeck:browser:request'; requestId: string; command: BrowserNativeCommand }
export interface BrowserNativeResult { type: 'deepdeck:browser:result'; requestId: string; ok: boolean; value?: unknown; error?: string }
export interface BrowserNativeEvent { type: 'deepdeck:browser:event'; snapshot: BrowserSnapshot }

/** The command selects the result type; callers cannot invent a response type. */
export type BrowserNativeResponseMap = {
  [Action in 'open' | 'snapshot' | 'tab.open' | 'tab.reopen' | 'tab.duplicate' | 'tab.closeOthers' | 'tab.closeRight'
    | 'tab.move' | 'tab.mute' | 'tab.activate' | 'tab.close' | 'tab.back' | 'tab.forward' | 'tab.reload' | 'tab.stop' | 'tab.navigate' | 'layout']: BrowserSnapshot
} & {
  [Action in 'auth.respond' | 'tab.print' | 'tab.save' | 'tab.devtools' | 'tab.siteInfo' | 'window.fullscreen' | 'download.control' | 'page.menu.configure' | 'page.selection.ack' | 'tab.menu' | 'find' | 'zoom' | 'devtools.begin' | 'devtools.close' | 'devtools.end']: { ok: true }
} & {
  'devtools.open': BrowserDevToolsLease
  'webmcp.install': WebMCPInstallReceipt
  'webmcp.remove': { removed: true }
  'webmcp.cancel': { cancelled: true }
  // Web page tools deliberately return arbitrary JSON values.
  'webmcp.call': unknown
  'page.screenshot': BrowserScreenshot
  'page.inspect': BrowserInspection
  'page.network': { requests: unknown[]; console: unknown[] }
  'page.evaluate': { value?: unknown }
  'page.interact': { ok: true; documentId: string; navigated: boolean }
}
export type BrowserNativeResponse<Command extends BrowserNativeCommand> = BrowserNativeResponseMap[Command['action']]
