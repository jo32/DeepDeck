import type { BrowserNativeCommand, BrowserNativeResponse } from './native-contract.js'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string'
const count = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0
const rows = (value: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(check)
const optionalText = (value: unknown): boolean => value === undefined || text(value)
const tool = (value: unknown): boolean => record(value) && text(value.name) && text(value.description) && record(value.inputSchema)
  && text(value.frameId) && text(value.documentId) && text(value.origin) && ['site', 'deepdeck'].includes(String(value.source)) && optionalText(value.revision)
const tab = (value: unknown): boolean => record(value) && ['id', 'url', 'origin', 'title', 'documentId'].every(key => text(value[key]))
  && ['loading', 'canGoBack', 'canGoForward'].every(key => typeof value[key] === 'boolean') && rows(value.tools, tool)
  && (value.zoomFactor === undefined || typeof value.zoomFactor === 'number' && Number.isFinite(value.zoomFactor) && value.zoomFactor >= .25 && value.zoomFactor <= 5)
  && (value.muted === undefined || typeof value.muted === 'boolean')
  && (value.audible === undefined || typeof value.audible === 'boolean')
  && (value.find === undefined || record(value.find) && text(value.find.text) && count(value.find.matches) && count(value.find.activeMatch))
const target = (value: unknown): boolean => record(value) && text(value.tabId) && text(value.documentId)
export const isBrowserSnapshot = (value: unknown): boolean => record(value) && typeof value.open === 'boolean'
  && optionalText(value.activeTabId) && rows(value.tabs, tab)
  && rows(value.downloads, item => record(item) && text(item.id) && text(item.filename) && text(item.state) && count(item.receivedBytes) && count(item.totalBytes))
  && (value.authentication === undefined || rows(value.authentication, item => record(item) && text(item.id) && text(item.tabId) && text(item.host) && text(item.realm) && typeof item.isProxy === 'boolean'))
  && (value.selections === undefined || rows(value.selections, item => record(item) && target(item) && text(item.id) && text(item.text) && text(item.url) && text(item.title)))

/** Validate the IPC payload before a typed result can enter the Host runtime. */
export function isBrowserNativeResponse<C extends BrowserNativeCommand>(command: C, value: unknown): value is BrowserNativeResponse<C> {
  if (command.action === 'webmcp.call') return true
  if (!record(value)) return false
  switch (command.action) {
    case 'open': case 'snapshot': case 'tab.open': case 'tab.reopen': case 'tab.duplicate': case 'tab.closeOthers': case 'tab.closeRight':
    case 'tab.move': case 'tab.mute': case 'tab.activate': case 'tab.close': case 'tab.back': case 'tab.forward': case 'tab.reload': case 'tab.stop': case 'tab.navigate': case 'layout':
      return isBrowserSnapshot(value)
    case 'auth.respond': case 'tab.print': case 'tab.save': case 'tab.devtools': case 'tab.siteInfo': case 'window.fullscreen': case 'download.control': case 'page.menu.configure': case 'page.selection.ack': case 'tab.menu': case 'find': case 'zoom': case 'devtools.begin': case 'devtools.close': case 'devtools.end':
      return value.ok === true
    case 'devtools.open': return text(value.id) && text(value.wsEndpoint) && text(value.token)
    case 'webmcp.remove': return value.removed === true
    case 'webmcp.cancel': return value.cancelled === true
    case 'webmcp.install': return value.installed === true && value.origin === command.script.origin && value.revision === command.script.revision
      && count(value.matched) && count(value.registered) && count(value.failed)
      && rows(value.tabs, item => record(item) && target(item) && text(item.revision) && rows(item.registered, text) && rows(item.tools, tool))
    case 'page.screenshot': return value.documentId === command.documentId && text(value.image) && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(value.image)
    case 'page.network': return Array.isArray(value.requests) && Array.isArray(value.console)
    case 'page.evaluate': return true
    case 'page.interact': return value.ok === true && text(value.documentId) && typeof value.navigated === 'boolean'
    case 'page.inspect': return value.documentId === command.documentId && record(value.content)
      && text(value.content.title) && text(value.content.url) && text(value.content.text) && Array.isArray(value.content.elements)
      && Array.isArray(value.accessibility) && Array.isArray(value.console) && rows(value.tools, tool)
      && rows(value.frames, item => record(item) && text(item.id) && text(item.origin) && optionalText(item.parentId))
  }
}
