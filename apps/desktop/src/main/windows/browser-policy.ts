import type { BrowserNativeRequest, WebMCPScript } from "../../../../../plugins/browser/src/native-contract.js";

const ACTIONS = new Set(['auth.respond', 'tab.move', 'tab.mute', 'tab.print', 'tab.save', 'tab.devtools', 'tab.siteInfo', 'window.fullscreen', 'download.control',
  "open", "snapshot", "tab.open", "tab.menu", "tab.duplicate", "tab.closeOthers", "tab.closeRight", "tab.reopen", "tab.activate", "tab.close", "tab.back", "tab.forward",
  "tab.reload", "tab.stop", "tab.navigate", "layout", "find", "zoom", "webmcp.call",
  "webmcp.cancel", "webmcp.install", "webmcp.remove", "page.inspect", "page.screenshot",
  "page.network", "page.evaluate", "page.interact", "devtools.open", "devtools.close", "devtools.begin", "devtools.end",
  "page.menu.configure", "page.selection.ack",
]);

export function isBrowserNativeRequest(value: unknown): value is BrowserNativeRequest {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.type !== "deepdeck:browser:request" || typeof item.requestId !== "string"
    || !item.requestId || item.requestId.length > 128 || !item.command || typeof item.command !== "object") return false;
  const command = item.command as Record<string, unknown>;
  return typeof command.action === "string" && ACTIONS.has(command.action);
}

export function browserUrl(value: unknown = "about:blank"): string {
  if (value === "about:blank") return value;
  if (typeof value !== "string" || value.length > 16_384) throw new Error("Invalid browser URL.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter an http or https URL."); }
  if (url.protocol === "blob:") {
    const nested = new URL(value.slice(5));
    if (["http:", "https:"].includes(nested.protocol) && !nested.username && !nested.password) return url.href;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Browser navigation only supports http, https and about:blank.");
  }
  return url.href;
}

export function browserOrigin(value: string): string {
  try { const url = new URL(value); return ["http:", "https:", "blob:"].includes(url.protocol) && url.origin !== "null" ? url.origin : ""; }
  catch { return ""; }
}

export function validateWebMCPScript(script: WebMCPScript): void {
  if (!script || typeof script.origin !== "string" || browserOrigin(browserUrl(script.origin)) !== script.origin
    || typeof script.revision !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(script.revision)
    || typeof script.source !== "string" || !script.source.trim() || script.source.length > 1_000_000) {
    throw new Error("Invalid WebMCP origin, revision or source.");
  }
}

export function browserContentBounds(width: number, height: number, top: number, right: number) {
  const y = Math.min(Math.max(0, Math.round(top)), Math.max(0, height - 1));
  const sidebar = Math.min(Math.max(0, Math.round(right)), Math.max(0, width - 1));
  return { x: 0, y, width: Math.max(1, width - sidebar), height: Math.max(1, height - y) };
}
