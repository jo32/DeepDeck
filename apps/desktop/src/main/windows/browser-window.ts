import { BaseWindow, WebContentsView, Menu, app, clipboard, dialog, session, shell as systemShell, type Session } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserNativeCommand, BrowserNativeResponse, BrowserNativeResponseMap, BrowserInspection, BrowserSnapshot, BrowserTab, BrowserTarget, WebMCPScript, WebMCPInstallReceipt, WebMCPPageReceipt } from "../../../../../plugins/browser/src/native-contract.js";
import { browserContentBounds, browserOrigin, browserUrl, validateWebMCPScript } from "./browser-policy.js";
import { WEBMCP_BINDING, WEBMCP_WORLD, webmcpBootstrap, webmcpDispose } from "./browser-webmcp-script.js";
import { browserShortcut } from "./browser-shortcuts.js";
import { createDevToolsLease, type DevToolsLease } from "./browser-devtools.js";
import { createBrowserSession, nextZoom, writeBrowserState } from "./browser-session.js";
import { pageMenu, PAGE_MENU_LABELS } from "./browser-page-menu.js";
import type { BrowserAuthentication, BrowserSelection, BrowserPageMenuLabels, BrowserPageMenuAction } from "../../../../../plugins/browser/src/native-contract.js";

// CDP is an experimental, browser-versioned JSON boundary.
type ProtocolRecord = Record<string, any>;
interface TabState {
  view: WebContentsView;
  contents: Electron.WebContents;
  state: BrowserTab;
  frames: Map<string, { origin: string; parentId?: string }>;
  contexts: Map<number, string>;
  scripts: Map<string, string>;
  generated: Map<string, string>;
  network: ProtocolRecord[];
  console: ProtocolRecord[];
  mainFrameId?: string;
  ready: Promise<void>;
  findRequest?: number;
  closePromise?: Promise<boolean>;
  closingHistory?: { url: string; index: number; entries: Electron.NavigationEntry[]; activeIndex: number };
}
interface PendingCall {
  tabId: string;
  documentId: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  invocationId?: string;
}
export interface BrowserWindowManager {
  execute<C extends BrowserNativeCommand>(command: C): Promise<BrowserNativeResponse<C>>;
  snapshot(): BrowserSnapshot;
  restoreShell(baseUrl: string): Promise<void>;
  dispose(): void;
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const keyFor = (frameId: string, name: string): string => `${frameId}\n${name}`;
const TOOL_TIMEOUT_MS = 60_000;
// Check each structured producer against the shared wire contract.
const reply = <A extends BrowserNativeCommand['action']>(_action: A, value: BrowserNativeResponseMap[A]): BrowserNativeResponseMap[A] => value;

export function createBrowserWindowManager(displayName: string, onSnapshot: (snapshot: BrowserSnapshot) => void): BrowserWindowManager {
  let window: BaseWindow | undefined;
  let shell: WebContentsView | undefined;
  let shellUrl = "";
  let activeTabId: string | undefined;
  let top = 92;
  let right = 0;
  let closing = false;
  let windowCloseRequested = false;
  let htmlFullscreenTab: string | undefined;
  const tabs = new Map<string, TabState>();
  const closedTabs: { url: string; index: number; entries: Electron.NavigationEntry[]; activeIndex: number }[] = [];
  let tabMenu: Menu | undefined;
  let pagePopup: { menu: Menu; tabId: string } | undefined;
  let pageMenuLabels: BrowserPageMenuLabels = PAGE_MENU_LABELS;
  let selections: BrowserSelection[] = [];
  const authentication = new Map<string, { challenge: BrowserAuthentication; callback: (username?: string, password?: string) => void }>();
  const scripts = new Map<string, WebMCPScript>();
  // Own the entire native transaction, including failure rollback. Host aborts
  // only stop waiting for IPC; later install/remove requests must not overtake it.
  const mutations = new Map<string, Promise<void>>();

  const calls = new Map<string, PendingCall>();
  const busyTabs = new Set<string>();
  const devtools = new Map<string, { lease: DevToolsLease; tabId: string; busy: boolean }>();
  const earlyResponses = new Map<string, ProtocolRecord>();
  const statePath = join(app.getPath("userData"), "browser-tabs.json");
  const profile: Session = session.fromPartition("persist:deepdeck-browser");
  const guestPreferences: Electron.WebPreferences = { session: profile, contextIsolation: true, nodeIntegration: false,
    sandbox: true, enableBlinkFeatures: "WebMCP", navigateOnDragDrop: false, spellcheck: true, plugins: true };
  const nativeSession = createBrowserSession(profile, () => window, wc => [...tabs.values()].some(tab => tab.contents === wc), emit);

  function guestUrl(value?: string): string {
    const url = browserUrl(value);
    if (shellUrl && browserOrigin(url) === browserOrigin(shellUrl)) throw new Error("The Harness application cannot be opened as a Browser website.");
    return url;
  }

  async function externalLink(tab: TabState, value: string): Promise<void> {
    let destination: URL;
    try { destination = new URL(value); } catch { return; }
    if (!['mailto:', 'tel:', 'sms:', 'zoommtg:', 'feishu:', 'lark:'].includes(destination.protocol) || value.length > 4096 || !window) return;
    const documentId = tab.state.documentId;
    const chinese = app.getLocale().startsWith('zh');
    const result = await dialog.showMessageBox(window, { type: 'question', message: chinese ? '在外部应用中打开？' : 'Open in another application?',
      detail: `${tab.state.origin}\n${value}`, buttons: chinese ? ['取消', '打开'] : ['Cancel', 'Open'], defaultId: 0, cancelId: 0 });
    if (result.response === 1 && tabs.has(tab.state.id) && tab.state.documentId === documentId) await systemShell.openExternal(destination.href);
  }

  function snapshot(): BrowserSnapshot {
    return { open: !!window && !window.isDestroyed(), tabs: [...tabs.values()].map(tab => structuredClone(tab.state)),
      ...(activeTabId ? { activeTabId } : {}), downloads: structuredClone(nativeSession.downloads), canReopenClosedTab: closedTabs.length > 0,
      ...(authentication.size ? { authentication: [...authentication.values()].map(value => value.challenge) } : {}),
      ...(selections.length ? { selections: structuredClone(selections) } : {}) };
  }
  function emit(): void { onSnapshot(snapshot()); }
  function persist(): void {
    if (closing || windowCloseRequested || tabs.size === 0) return;
    try { writeBrowserState(statePath, { urls: [...tabs.values()].map(tab => tab.state.url.startsWith("blob:") ? tab.state.origin : tab.state.url), tabs: [...tabs.values()].map(tab => ({ url: tab.state.url, entries: tab.contents.navigationHistory.getAllEntries(), activeIndex: tab.contents.navigationHistory.getActiveIndex() })), activeIndex: [...tabs.keys()].indexOf(activeTabId ?? "") }); }
    catch (error) { console.error("Unable to save Browser tabs", error); }
  }
  function syncBounds(): void {
    if (!window || window.isDestroyed()) return;
    const [width = 0, height = 0] = window.getContentSize();
    shell?.setBounds({ x: 0, y: 0, width, height });
    for (const tab of tabs.values()) {
      tab.view.setVisible(tab.state.id === activeTabId && tab.state.url !== "about:blank" && !tab.state.error);
      tab.view.setBounds(browserContentBounds(width, height, htmlFullscreenTab ? 0 : top, htmlFullscreenTab ? 0 : right));
    }
  }
  function focusActive(): void {
    const tab = activeTabId ? tabs.get(activeTabId) : undefined;
    const contents = tab && tab.state.url !== "about:blank" && !tab.state.error
      ? tab.contents
      : shell?.webContents;
    if (contents && !contents.isDestroyed()) contents.focus();
  }
  function tabById(id: string): TabState {
    const tab = tabs.get(id);
    if (!tab || tab.contents.isDestroyed()) throw new Error("Browser tab is closed.");
    return tab;
  }
  function target(command: BrowserTarget): TabState {
    const tab = tabById(command.tabId);
    if (tab.state.documentId !== command.documentId) throw new Error("The page changed. Inspect the current page before trying again.");
    return tab;
  }
  async function send(tab: TabState, method: string, params: ProtocolRecord = {}): Promise<ProtocolRecord> {
    if (tab.contents.isDestroyed()) throw new Error("Browser tab is closed.");
    return await tab.contents.debugger.sendCommand(method, params) as ProtocolRecord;
  }
  function finishCall(callId: string, value: unknown, error?: string): void {
    const call = calls.get(callId);
    if (!call) return;
    clearTimeout(call.timer);
    calls.delete(callId);
    if (error) call.reject(new Error(error)); else call.resolve(value);
  }
  async function cancelCall(callId: string, reason = "WebMCP invocation cancelled; an action already started may have taken effect."): Promise<void> {
    const call = calls.get(callId);
    if (!call) return;
    finishCall(callId, undefined, reason);
    const tab = tabs.get(call.tabId);
    if (tab && call.invocationId) await send(tab, "WebMCP.cancelInvocation", { invocationId: call.invocationId }).catch(() => undefined);
  }
  function invalidate(tab: TabState, reason: string): void {
    if (pagePopup?.tabId === tab.state.id) { pagePopup.menu.closePopup(window); pagePopup = undefined; }
    selections = selections.filter(selection => selection.tabId !== tab.state.id);
    for (const [id, request] of authentication) if (request.challenge.tabId === tab.state.id) { authentication.delete(id); request.callback(); }
    tab.state.documentId = randomUUID();
    tab.state.tools = [];
    tab.generated.clear();
    for (const [id, call] of calls) if (call.tabId === tab.state.id) void cancelCall(id, reason);
  }
  function invalidateFrame(tab: TabState, frameId: string): void {
    // CDP can detach a whole frame subtree without a separate event per descendant.
    const changed = new Set([frameId]);
    for (let previousSize = 0; previousSize !== changed.size;) {
      previousSize = changed.size;
      for (const [id, frame] of tab.frames) if (frame.parentId && changed.has(frame.parentId)) changed.add(id);
    }
    const remaining = tab.state.tools.filter(tool => !changed.has(tool.frameId));
    const owners = new Map([...tab.generated].filter(([key]) => !changed.has(key.split("\n")[0]!)));
    invalidate(tab, "A page frame changed while the operation was running; its result is unknown.");
    tab.state.tools = remaining.map(tool => ({ ...tool, documentId: tab.state.documentId }));
    tab.generated = owners;
    for (const id of changed) tab.frames.delete(id);
    for (const [id, owner] of tab.contexts) if (changed.has(owner)) tab.contexts.delete(id);
  }
  function update(tab: TabState): void {
    const wc = tab.contents;
    if (wc.isDestroyed()) return;
    tab.state.url = wc.getURL() || tab.state.url;
    tab.state.origin = browserOrigin(tab.state.url);
    tab.state.title = wc.getTitle() || (tab.state.url === "about:blank" ? "New tab" : tab.state.url);
    tab.state.loading = wc.isLoading();
    tab.state.zoomFactor = Math.round(wc.getZoomFactor() * 1e6) / 1e6;
    tab.state.audible = wc.isCurrentlyAudible();
    tab.state.muted = wc.isAudioMuted();
    tab.state.canGoBack = wc.navigationHistory.canGoBack();
    tab.state.canGoForward = wc.navigationHistory.canGoForward();
    const hiddenGuestHadFocus = tab.state.id === activeTabId && wc.isFocused()
      && (tab.state.url === "about:blank" || !!tab.state.error);
    syncBounds();
    // Only move focus when its current native view has become hidden. Routine
    // page events must not steal the user's address-bar or Agent-composer focus.
    if (hiddenGuestHadFocus) focusActive();
    emit();
    persist();
  }
  function navigationError(tab: TabState, error: unknown): void {
    // Chromium rejects loadURL when the user stops/replaces a navigation or a
    // response becomes a download. The already displayed page remains usable.
    if (tab.contents.isDestroyed() || (error as { errno?: number }).errno === -3 || (error as { code?: string }).code === 'ERR_ABORTED') return;
    tab.state.error = message(error); update(tab);
  }
  function receiveResponse(tab: TabState, params: ProtocolRecord): void {
    const entry = [...calls].find(([, call]) => call.tabId === tab.state.id && call.invocationId === params.invocationId);
    if (!entry) {
      earlyResponses.set(keyFor(tab.state.id, String(params.invocationId)), params);
      if (earlyResponses.size > 100) earlyResponses.delete(earlyResponses.keys().next().value!);
      return;
    }
    if (params.status === "Completed") finishCall(entry[0], params.output);
    else finishCall(entry[0], undefined, String(params.errorText || params.exception?.description || params.exception?.value || `WebMCP invocation ${String(params.status)}.`));
  }
  function handleProtocol(tab: TabState, method: string, params: ProtocolRecord): void {
    if (method === "Page.frameNavigated") {
      const frame = params.frame;
      if (!frame.parentId) tab.mainFrameId = frame.id;
      else invalidateFrame(tab, frame.id);
      tab.frames.set(frame.id, { origin: browserOrigin(frame.url), ...(frame.parentId ? { parentId: frame.parentId } : {}) });
      tab.state.tools = tab.state.tools.filter(tool => tool.frameId !== frame.id);
      emit();
    } else if (method === "Page.frameDetached") {
      invalidateFrame(tab, params.frameId);
      tab.frames.delete(params.frameId);
      tab.state.tools = tab.state.tools.filter(tool => tool.frameId !== params.frameId);
      emit();
    } else if (method === "Page.navigatedWithinDocument" && params.frameId !== tab.mainFrameId) {
      // A subframe route also changes the target of any queued operation.
      const previous = tab.state.tools;
      const owners = new Map(tab.generated);
      invalidate(tab, "A page frame route changed; inspect the current page before continuing.");
      tab.state.tools = previous.map(tool => ({ ...tool, documentId: tab.state.documentId }));
      tab.generated = owners;
      emit();
    } else if (method === "Runtime.executionContextCreated") {
      if (params.context.name === WEBMCP_WORLD) tab.contexts.set(params.context.id, params.context.auxData?.frameId ?? "");
    } else if (method === "Runtime.executionContextDestroyed") {
      tab.contexts.delete(params.executionContextId);
    } else if (method === "Runtime.executionContextsCleared") {
      tab.contexts.clear();
    } else if (method === "Runtime.bindingCalled" && params.name === WEBMCP_BINDING && tab.contexts.has(params.executionContextId)) {
      try {
        const report = JSON.parse(params.payload) as ProtocolRecord;
        const frameId = tab.contexts.get(params.executionContextId)!;
        const installed = scripts.get(report.origin);
        if (!installed || installed.revision !== report.revision || report.origin !== tab.frames.get(frameId)?.origin) return;
        if (report.kind === "registered" && typeof report.name === "string") {
          tab.generated.set(keyFor(frameId, report.name), report.revision);
          const tool = tab.state.tools.find(tool => tool.frameId === frameId && tool.name === report.name);
          if (tool) { tool.source = "deepdeck"; tool.revision = report.revision; }
          delete tab.state.webmcpError;
        } else if (report.kind === "error") tab.state.webmcpError = String(report.message);
        emit();
      } catch { /* A malformed page report cannot affect the host. */ }
    } else if (method === "WebMCP.toolsAdded") {
      for (const item of params.tools ?? []) {
        const key = keyFor(item.frameId, item.name);
        const revision = tab.generated.get(key);
        tab.state.tools = tab.state.tools.filter(tool => keyFor(tool.frameId, tool.name) !== key);
        tab.state.tools.push({ name: item.name, description: item.description ?? "", inputSchema: item.inputSchema ?? { type: "object" },
          frameId: item.frameId, documentId: tab.state.documentId, origin: tab.frames.get(item.frameId)?.origin ?? tab.state.origin,
          source: revision ? "deepdeck" : "site", ...(revision ? { revision } : {}) });
      }
      emit();
    } else if (method === "WebMCP.toolsRemoved") {
      for (const item of params.tools ?? []) {
        tab.state.tools = tab.state.tools.filter(tool => keyFor(tool.frameId, tool.name) !== keyFor(item.frameId, item.name));
        tab.generated.delete(keyFor(item.frameId, item.name));
      }
      emit();
    } else if (method === "WebMCP.toolResponded") receiveResponse(tab, params);
    else if (method === "Network.requestWillBeSent") {
      tab.network.push({ requestId: params.requestId, url: params.request?.url, method: params.request?.method, type: params.type });
      if (tab.network.length > 150) tab.network.shift();
    } else if (method === "Network.responseReceived") {
      const request = tab.network.find(item => item.requestId === params.requestId);
      if (request) { request.status = params.response?.status; request.mimeType = params.response?.mimeType; }
    } else if (method === "Runtime.exceptionThrown") {
      tab.console.push({ kind: "exception", text: params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text });
      if (tab.console.length > 30) tab.console.shift();
    } else if (method === "Runtime.consoleAPICalled") {
      tab.console.push({ kind: params.type, text: (params.args ?? []).map((arg: ProtocolRecord) => String(arg.value ?? arg.description ?? "")).join(" ").slice(0, 3000) });
      if (tab.console.length > 30) tab.console.shift();
    }
  }
  async function evaluate(tab: TabState, expression: string, isolated = false): Promise<unknown> {
    if (typeof expression !== "string" || expression.length > 1_000_000) throw new Error("Invalid page script.");
    let contextId: number | undefined;
    if (isolated) {
      if (!tab.mainFrameId) throw new Error("Page frame is not ready.");
      const context = await send(tab, "Page.createIsolatedWorld", { frameId: tab.mainFrameId, worldName: WEBMCP_WORLD });
      contextId = context.executionContextId;
      tab.contexts.set(contextId!, tab.mainFrameId);
    }
    const result = await send(tab, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true,
      ...(contextId ? { contextId } : {}), timeout: 15_000 });
    if (result.exceptionDetails) throw new Error(String(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
    return result.result?.value;
  }
  async function addScript(tab: TabState, script: WebMCPScript): Promise<void> {
    const previous = tab.scripts.get(script.origin);
    if (previous) await send(tab, "Page.removeScriptToEvaluateOnNewDocument", { identifier: previous });
    const result = await send(tab, "Page.addScriptToEvaluateOnNewDocument", { source: webmcpBootstrap(script), worldName: WEBMCP_WORLD });
    tab.scripts.set(script.origin, result.identifier);
  }
  async function initialize(tab: TabState, blank: boolean): Promise<void> {
    const wc = tab.contents;
    if (blank) await wc.loadURL("about:blank");
    wc.debugger.attach("1.3");
    tab.frames.clear(); tab.contexts.clear(); tab.scripts.clear();
    delete tab.state.webmcpError;
    await send(tab, "Page.enable");
    await send(tab, "Runtime.enable");
    await send(tab, "Network.enable");
    await send(tab, "Runtime.addBinding", { name: WEBMCP_BINDING, executionContextName: WEBMCP_WORLD });
    const tree = await send(tab, "Page.getFrameTree");
    function remember(tree: ProtocolRecord): void {
      const frame = tree.frame;
      if (!frame.parentId) tab.mainFrameId = frame.id;
      tab.frames.set(frame.id, { origin: browserOrigin(frame.url), ...(frame.parentId ? { parentId: frame.parentId } : {}) });
      for (const child of tree.childFrames ?? []) remember(child);
    }
    remember(tree.frameTree);
    for (const script of scripts.values()) await addScript(tab, script);
    try { await send(tab, "WebMCP.enable"); }
    catch (error) { tab.state.webmcpError = `WebMCP discovery is unavailable: ${message(error)}`; }
    // A popup may have started loading before its protocol session was attached.
    if (!blank) {
      const script = scripts.get(browserOrigin(wc.getURL()));
      if (script) await evaluate(tab, webmcpBootstrap(script), true).catch(error => { tab.state.webmcpError = message(error); });
    }
    update(tab);
  }
  function createTab(blank = true, options: Electron.WebContentsViewConstructorOptions = {}, activate = true): TabState {
    if (!window || window.isDestroyed()) throw new Error("Open Browser first.");
    const view = new WebContentsView({ ...(options.webContents ? { webContents: options.webContents } : {}),
      webPreferences: { ...options.webPreferences, ...guestPreferences } });
    const tab: TabState = { view, contents: view.webContents, state: { id: randomUUID(), url: "about:blank", origin: "", title: "New tab", documentId: randomUUID(),
      loading: false, canGoBack: false, canGoForward: false, tools: [], zoomFactor: 1, audible: false, muted: false }, frames: new Map(), contexts: new Map(),
      scripts: new Map(), generated: new Map(), network: [], console: [], ready: Promise.resolve() };
    const wc = view.webContents;
    wc.debugger.on("message", (_event, method, params, sessionId) => {
      // DevTools MCP owns separate CDP sessions on this same WebContents. Their
      // events must not be folded twice into Browser's document/tool registry.
      if (!sessionId) handleProtocol(tab, method, params as ProtocolRecord);
    });
    wc.debugger.on("detach", (_event, reason) => {
      if (wc.isDestroyed()) return;
      tab.state.webmcpError = `Browser protocol disconnected: ${reason}. Reload this tab to reconnect.`;
      invalidate(tab, "Browser protocol disconnected; the operation result is unknown.");
      emit();
    });

    tabs.set(tab.state.id, tab);
    window.contentView.addChildView(view);
    if (activate) activeTabId = tab.state.id;
    wc.on("will-navigate", (event, url) => { try { guestUrl(url); } catch { event.preventDefault(); void externalLink(tab, url).catch(error => console.error('External link failed', error)); } });
    wc.on("will-redirect", (event, url) => { try { guestUrl(url); } catch { event.preventDefault(); } });
    wc.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      if (!isInPlace) {
        invalidate(tab, "Page navigated while the operation was running; its result is unknown.");
        tab.network = []; tab.console = []; tab.frames.clear();
        delete tab.state.favicon; delete tab.state.find; delete tab.findRequest;
        wc.stopFindInPage("clearSelection");
      } else {
        // SPA routing retains the tools, but any queued call must rebind to the current route.
        const saved = tab.state.tools;
        const owners = new Map(tab.generated);
        invalidate(tab, "Page route changed while the operation was running; its result is unknown.");
        tab.state.tools = saved.map(tool => ({ ...tool, documentId: tab.state.documentId }));
        tab.generated = owners;
      }
      tab.state.url = url; tab.state.origin = browserOrigin(url); delete tab.state.error;
      emit();
    });
    wc.on("login", (event, _details, authInfo, callback) => {
      event.preventDefault();
      const challenge = { id: randomUUID(), tabId: tab.state.id, host: `${authInfo.host}:${authInfo.port}`, realm: authInfo.realm, isProxy: authInfo.isProxy };
      authentication.set(challenge.id, { challenge, callback }); emit();
      if (tab.state.id === activeTabId) shell?.webContents.focus();
    });
    wc.on("did-navigate", () => { wc.setZoomFactor(nativeSession.zoomFor(browserOrigin(wc.getURL()))); update(tab); });
    wc.on("found-in-page", (_event, result) => {
      if (result.requestId !== tab.findRequest || !tab.state.find) return;
      tab.state.find.matches = result.matches; tab.state.find.activeMatch = result.activeMatchOrdinal; emit();
    });
    wc.on("zoom-changed", (_event, direction) => { setZoom(tab, nextZoom(wc.getZoomFactor(), direction === "in" ? 1 : -1)); });
    wc.on("media-started-playing", () => update(tab));
    wc.on("media-paused", () => update(tab));
    wc.on("audio-state-changed", () => update(tab));
    wc.on("enter-html-full-screen", () => {
      if (activeTabId !== tab.state.id || !window) return;
      htmlFullscreenTab = tab.state.id; syncBounds();
    });
    wc.on("leave-html-full-screen", () => { leaveHtmlFullscreen(tab); });
    wc.on("will-prevent-unload", event => {
      if (!window || window.isDestroyed()) return;
      const chinese = app.getLocale().startsWith("zh");
      const response = dialog.showMessageBoxSync(window, { type: "warning",
        message: chinese ? "离开此页面？" : "Leave this page?",
        detail: `${tab.state.origin}\n${chinese ? "你所做的更改可能尚未保存。" : "Changes you made may not be saved."}`,
        buttons: chinese ? ["留在页面", "离开"] : ["Stay", "Leave"], defaultId: 0, cancelId: 0 });
      if (response === 1) event.preventDefault();
    });
    wc.on("devtools-closed", () => { void ensureProtocol(tab).catch(error => { tab.state.webmcpError = message(error); emit(); }); });
    wc.on("did-start-loading", () => update(tab));
    wc.on("did-stop-loading", () => update(tab));
    wc.on("did-navigate-in-page", () => update(tab));
    wc.on("page-title-updated", () => update(tab));
    wc.on("page-favicon-updated", (_event, icons) => { if (icons[0]?.startsWith("https:") || icons[0]?.startsWith("http:")) tab.state.favicon = icons[0]; emit(); });
    wc.on("did-fail-load", (_event, code, description, _url, main) => { if (main && code !== -3) { tab.state.error = description; update(tab); } });
    wc.on("render-process-gone", (_event, details) => { invalidate(tab, "Browser renderer stopped; the operation result is unknown."); tab.state.error = details.reason; update(tab); });
    installShortcuts(wc);
    wc.on("context-menu", (_event, params) => {
      if (!window || window.isDestroyed() || activeTabId !== tab.state.id) return;
      const documentId = tab.state.documentId;
      const frame = params.frame;
      const selectedText = params.selectionText;
      const run = async (action: BrowserPageMenuAction) => {
        if (wc.isDestroyed() || tab.state.documentId !== documentId || activeTabId !== tab.state.id || frame?.detached) return;
        switch (action) {
          case 'copy': wc.copy(); break;
          case 'copyImage': wc.copyImageAt(params.x, params.y); break;
          case 'openImage': await openTab(guestUrl(params.srcURL), tab.state.id); break;
          case 'saveImage': wc.downloadURL(guestUrl(params.srcURL)); break;
          case 'saveLink': wc.downloadURL(guestUrl(params.linkURL)); break;
          case 'copyLink': clipboard.writeText(params.linkURL); break;
          case 'searchSelection': await openTab(`https://www.google.com/search?q=${encodeURIComponent(selectedText.trim())}`, tab.state.id); break;
          case 'openLink': await openTab(guestUrl(params.linkURL), tab.state.id); break;
          case 'askAgent': {
            const text = selectedText.length > 32_000 ? `${selectedText.slice(0, 32_000)}\n…` : selectedText;
            selections.push({ id: randomUUID(), tabId: tab.state.id, documentId, text,
              url: params.frameURL || params.pageURL || tab.state.url, title: tab.state.title });
            emit();
            shell?.webContents.focus();
            break;
          }
          case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
          case 'forward': if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
          case 'reload': wc.reload(); break;
          case 'inspect': wc.inspectElement(params.x, params.y); break;
          default: wc.focus(); wc[action]();
        }
      };
      const template: Electron.MenuItemConstructorOptions[] = pageMenu({ ...params,
        canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward(),
      }, pageMenuLabels).map(item => 'type' in item ? item : ({
        label: item.label, enabled: item.enabled,
        ...(item.accelerator ? { accelerator: item.accelerator, registerAccelerator: false } : {}),
        click: () => { void run(item.action).catch(error => console.error('Browser page menu failed', error)); },
      }));
      pagePopup?.menu.closePopup(window);
      const menu = Menu.buildFromTemplate(template);
      pagePopup = { menu, tabId: tab.state.id };
      const bounds = tab.view.getBounds();
      const scale = wc.getZoomFactor();
      menu.popup({ window, ...(frame ? { frame } : {}),
        x: Math.round(bounds.x + params.x * scale), y: Math.round(bounds.y + params.y * scale),
        callback: () => { if (pagePopup?.menu === menu) pagePopup = undefined; },
      });
    });
    wc.setWindowOpenHandler(({ url, disposition, referrer, postBody }) => {
      try { guestUrl(url); } catch { void externalLink(tab, url).catch(error => console.error('External link failed', error)); return { action: "deny" }; }
      return { action: "allow", overrideBrowserWindowOptions: { webPreferences: guestPreferences }, createWindow: options => {
        // Electron already owns the popup's WebContents and its opener relationship.
        // Adopt that exact instance; replacing it throws in openGuestWindow.
        const viewOptions: Electron.WebContentsViewConstructorOptions = options;
        const popup = createTab(!viewOptions.webContents, viewOptions, disposition !== "background-tab");
        void popup.ready.then(async () => {
          // Background links may not have a pre-created guest. In that case the
          // custom createWindow callback also owns starting the navigation.
          if (!viewOptions.webContents) await popup.contents.loadURL(url, {
            httpReferrer: referrer,
            ...(postBody ? { postData: postBody.data, extraHeaders: `Content-Type: ${postBody.contentType}${postBody.boundary ? `; boundary=${postBody.boundary}` : ""}` } : {})
          });
          if (activeTabId === popup.state.id) focusActive();
        }).catch(error => {
          if (popup.contents.isDestroyed()) return;
          popup.state.error = message(error); update(popup);
        });
        return popup.contents;
      } };
    });
    wc.on("destroyed", () => { if (tabs.has(tab.state.id)) finalizeClosedTab(tab.state.id); });
    tab.ready = initialize(tab, blank).catch(error => { tab.state.webmcpError = message(error); emit(); });
    syncBounds(); emit();
    return tab;
  }
  async function ensureProtocol(tab: TabState): Promise<void> {
    await tab.ready;
    if (!tab.contents.isDestroyed() && !tab.contents.debugger.isAttached()) {
      tab.ready = initialize(tab, false); await tab.ready;
    }
  }
  function leaveHtmlFullscreen(tab: TabState): void {
    if (htmlFullscreenTab !== tab.state.id) return;
    htmlFullscreenTab = undefined;
    void send(tab, "Runtime.evaluate", { expression: "if (document.fullscreenElement) document.exitFullscreen()" }).catch(() => undefined);
    syncBounds();
  }
  function setZoom(tab: TabState, factor: number): void {
    if (!Number.isFinite(factor) || factor < .25 || factor > 5) throw new Error("Zoom must be between 25% and 500%.");
    nativeSession.saveZoom(tab.state.origin, factor);
    // Chromium shares page zoom by host. Keep every same-host tab and its UI in sync.
    for (const other of tabs.values()) {
      if (other !== tab && (!tab.state.origin || new URL(other.state.url).hostname !== new URL(tab.state.url).hostname)) continue;
      other.contents.setZoomFactor(factor); other.state.zoomFactor = Math.round(other.contents.getZoomFactor() * 1e6) / 1e6;
      nativeSession.saveZoom(other.state.origin, factor);
    }
    emit();
  }
  function findInTab(tab: TabState, text: string, forward = true, next = false): void {
    if (typeof text !== "string" || text.length > 2000) throw new Error("Invalid find text.");
    const continuing = next && tab.state.find?.text === text;
    delete tab.findRequest;
    if (!text) { tab.contents.stopFindInPage("clearSelection"); delete tab.state.find; }
    else {
      tab.state.find = { text, matches: continuing ? tab.state.find?.matches ?? 0 : 0, activeMatch: continuing ? tab.state.find?.activeMatch ?? 0 : 0 };
      // Electron 43 maps findNext to Blink new_session (true for the initial request).
      tab.findRequest = tab.contents.findInPage(text, { forward, findNext: !continuing });
    }
    emit();
  }
  function installShortcuts(contents: Electron.WebContents): void {
    contents.on("before-input-event", (event, input) => {
      const shortcut = browserShortcut(input, process.platform);
      if (!shortcut) return;
      if (shortcut.action === "address" || shortcut.action === "find" || shortcut.action === "downloads") {
        // These are plugin UI actions; forward only from a guest, otherwise let
        // the shell receive the original key once through its normal handler.
        if (contents === shell?.webContents) return;
        event.preventDefault();
        shell?.webContents.focus();
        const keyCode = shortcut.action === "address" ? "L" : shortcut.action === "downloads" ? "J" : "F";
        const modifiers: Electron.InputEvent["modifiers"] = [process.platform === "darwin" ? "meta" : "control"];
        if (shortcut.action === "downloads" && process.platform === "darwin") modifiers.push("shift");
        shell?.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
        shell?.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
        return;
      }
      if (shortcut.action === "stop" && contents === shell?.webContents) return;
      if (shortcut.action === "stop" && !htmlFullscreenTab && activeTabId && tabs.get(activeTabId)?.state.find) {
        event.preventDefault(); shell?.webContents.focus();
        shell?.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        shell?.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" }); return;
      }
      if (shortcut.action === "stop" && !htmlFullscreenTab && (!activeTabId || !tabs.get(activeTabId)?.state.loading)) return;
      if (shortcut.action === "stop" && htmlFullscreenTab) { leaveHtmlFullscreen(tabById(htmlFullscreenTab)); return; }
      event.preventDefault();
      const active = activeTabId ? tabs.get(activeTabId) : undefined;
      if (shortcut.action === "cycle" || shortcut.action === "select") {
        const ids = [...tabs.keys()];
        if (!ids.length) return;
        const index = shortcut.action === "cycle"
          ? (ids.indexOf(activeTabId ?? "") + shortcut.offset + ids.length) % ids.length
          : shortcut.index < 0 ? ids.length - 1 : shortcut.index;
        if (ids[index]) { if (htmlFullscreenTab && htmlFullscreenTab !== ids[index]) leaveHtmlFullscreen(tabById(htmlFullscreenTab)); activeTabId = ids[index]; syncBounds(); focusActive(); emit(); persist(); }
        return;
      }
      let action: BrowserNativeCommand | undefined;
      if (shortcut.action === "new") action = { action: "tab.open" };
      else if (shortcut.action === "reopen") action = { action: "tab.reopen" };
      else if (shortcut.action === "close" && active) action = { action: "tab.close", tabId: active.state.id };
      else if (shortcut.action === "reload" && active) action = { action: "tab.reload", tabId: active.state.id };
      else if (shortcut.action === "reloadIgnoringCache" && active) active.contents.reloadIgnoringCache();
      else if (shortcut.action === "fullscreen") action = { action: "window.fullscreen" };
      else if (active) {
        if (shortcut.action === "zoomIn" || shortcut.action === "zoomOut" || shortcut.action === "zoomReset") {
          action = { action: "zoom", tabId: active.state.id, factor: shortcut.action === "zoomReset" ? 1 : nextZoom(active.contents.getZoomFactor(), shortcut.action === "zoomIn" ? 1 : -1) };
        } else if (shortcut.action === "findNext" || shortcut.action === "findPrevious") {
          findInTab(active, active.state.find?.text ?? "", shortcut.action === "findNext", true);
        } else if (["back", "forward", "stop", "print", "save", "devtools"].includes(shortcut.action)) {
          action = { action: `tab.${shortcut.action}`, tabId: active.state.id } as BrowserNativeCommand;
        }
      }
      if (action) void execute(action).catch(error => console.error("Browser shortcut failed", error));
    });
  }
  function moveTab(tab: TabState, index: number): void {
    const entries = [...tabs.entries()].filter(([id]) => id !== tab.state.id);
    entries.splice(Math.max(0, Math.min(index, entries.length)), 0, [tab.state.id, tab]);
    tabs.clear();
    for (const [id, value] of entries) tabs.set(id, value);
    emit();
  }
  async function restoreTab(saved: { url: string; index: number; entries: Electron.NavigationEntry[]; activeIndex: number }): Promise<void> {
    const url = guestUrl(saved.url);
    // Electron can restore history only into a WebContents that has never navigated.
    const tab = createTab(false);
    moveTab(tab, saved.index);
    // Navigation creates the renderer needed by the initial CDP commands. Start
    // it before awaiting protocol readiness; never pre-load about:blank here.
    const navigation = saved.entries.length && saved.entries.every(entry => { try { guestUrl(entry.url); return true; } catch { return false; } })
      ? tab.contents.navigationHistory.restore({ entries: saved.entries, index: saved.activeIndex }) : tab.contents.loadURL(url);
    // Do not let one slow site or HTTP auth prompt block restoration of other tabs.
    void navigation.then(async () => {
      await tab.ready;
      if (tab.contents.isDestroyed()) return;
      const script = scripts.get(browserOrigin(tab.contents.getURL()));
      if (script && !tab.state.error) await evaluate(tab, webmcpBootstrap(script), true)
        .catch(error => { tab.state.webmcpError = message(error); });
      update(tab);
    }).catch(error => navigationError(tab, error));
    await tab.ready;
    syncBounds(); focusActive(); emit(); persist();
  }
  async function openTab(url?: string, afterTabId?: string): Promise<BrowserSnapshot> {
    if (afterTabId) tabById(afterTabId);
    const destination = guestUrl(url);
    const tab = createTab();
    if (afterTabId) moveTab(tab, [...tabs.keys()].indexOf(afterTabId) + 1);
    await tab.ready;
    if (destination !== "about:blank") void tab.contents.loadURL(destination).catch(error => navigationError(tab, error));
    focusActive();
    persist();
    return snapshot();
  }
  async function closeTab(id: string): Promise<boolean> {
    const tab = tabs.get(id);
    if (!tab) return true;
    if (tab.closePromise) return await tab.closePromise;
    if (tab.contents.isDestroyed()) { finalizeClosedTab(id); return true; }
    tab.closingHistory = { url: tab.state.url, index: [...tabs.keys()].indexOf(id),
      entries: tab.contents.navigationHistory.getAllEntries(), activeIndex: tab.contents.navigationHistory.getActiveIndex() };
    tab.closePromise = new Promise<boolean>(resolve => {
      const done = (closed: boolean) => { tab.contents.removeListener("destroyed", destroyed); tab.contents.removeListener("will-prevent-unload", prevented); if (!closed) delete tab.closingHistory; resolve(closed); };
      const destroyed = () => done(true);
      const prevented = (event: Electron.Event) => {
        if (event.defaultPrevented) return;
        // Wait for the renderer to process the cancelled beforeunload response
        // before accepting another close request on the same WebContents.
        if (tab.contents.debugger.isAttached()) void send(tab, "Runtime.evaluate", { expression: "void 0" }).then(() => done(false), () => done(false));
        else setImmediate(() => done(false));
      };
      tab.contents.once("destroyed", destroyed); tab.contents.once("will-prevent-unload", prevented);
      if (tab.contents.debugger.isAttached()) void send(tab, "Page.close").catch(() => { if (!tab.contents.isDestroyed()) done(false); });
      else tab.contents.close({ waitForBeforeUnload: true });
    });
    try { return await tab.closePromise; }
    finally { delete tab.closePromise; }
  }
  function finalizeClosedTab(id: string): void {
    const tab = tabs.get(id);
    if (!tab) return;
    const ids = [...tabs.keys()];
    const index = ids.indexOf(id);
    if (!closing) {
      const history = tab.contents.isDestroyed() ? undefined : tab.contents.navigationHistory;
      closedTabs.push(tab.closingHistory ?? { url: tab.state.url, index, entries: history?.getAllEntries() ?? [], activeIndex: history?.getActiveIndex() ?? 0 });
      if (closedTabs.length > 20) closedTabs.shift();
    }
    leaveHtmlFullscreen(tab);
    invalidate(tab, "Browser tab closed; the operation result is unknown.");
    tabs.delete(id);
    for (const [leaseId, entry] of devtools) {
      if (entry.tabId !== id) continue;
      entry.lease.dispose(); devtools.delete(leaseId); busyTabs.delete(id);
    }
    if (!window?.isDestroyed()) window?.contentView.removeChildView(tab.view);
    if (!tab.contents.isDestroyed()) tab.contents.close();
    const wasActive = activeTabId === id;
    if (wasActive) activeTabId = ids[index + 1] ?? ids[index - 1];
    syncBounds(); if (wasActive && !closing) focusActive(); emit(); persist();
    if (!closing && !windowCloseRequested && tabs.size === 0 && window && !window.isDestroyed()) void openTab();
  }
  async function open(requestedShell: string, url?: string): Promise<BrowserSnapshot> {
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show(); window.focus();
      return url ? await openTab(url) : snapshot();
    }
    shellUrl = requestedShell;
    window = new BaseWindow({ width: 1440, height: 940, minWidth: 900, minHeight: 600,
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 17 } } : {}),
      title: `${displayName} Browser`, backgroundColor: "#f8fafc", show: false, autoHideMenuBar: true });
    shell = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.contentView.addChildView(shell);
    installShortcuts(shell.webContents);
    shell.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    shell.webContents.on("will-navigate", (event, url) => { if (new URL(url).origin !== new URL(shellUrl).origin) event.preventDefault(); });
    shell.webContents.on("will-redirect", (event, url) => { if (new URL(url).origin !== new URL(shellUrl).origin) event.preventDefault(); });
    window.on("resize", syncBounds);
    window.on("close", event => {
      if (closing) return;
      event.preventDefault();
      if (windowCloseRequested) return;
      persist(); windowCloseRequested = true;
      void (async () => {
        for (const id of [...tabs.keys()].reverse()) {
          if (!await closeTab(id)) { windowCloseRequested = false; persist(); return; }
        }
        closing = true; window?.close();
      })().catch(error => { windowCloseRequested = false; console.error("Unable to close Browser", error); });
    });
    window.on("closed", () => {
      closing = true;
      for (const id of [...tabs.keys()]) finalizeClosedTab(id);
      if (shell && !shell.webContents.isDestroyed()) shell.webContents.close();
      window = undefined; shell = undefined; activeTabId = undefined; closing = false; windowCloseRequested = false; htmlFullscreenTab = undefined;
      emit();
    });
    syncBounds();
    await shell.webContents.loadURL(requestedShell);
    window.show();
    let saved: { urls?: unknown; tabs?: { url: string; entries: Electron.NavigationEntry[]; activeIndex: number }[]; activeIndex?: number } = {};
    try { if (!url && existsSync(statePath)) saved = JSON.parse(readFileSync(statePath, "utf8")) as typeof saved; } catch { /* Ignore an interrupted state write. */ }
    const urls: string[] = url ? [url] : Array.isArray(saved.urls) ? saved.urls.filter((url): url is string => { try { browserUrl(url); return true; } catch { return false; } }).slice(0, 30) : [];
    for (const [index, destination] of (urls.length ? urls : ["about:blank"]).entries()) {
      const history = !url ? saved.tabs?.[index] : undefined;
      if (history && history.url === destination && Array.isArray(history.entries) && Number.isInteger(history.activeIndex)) await restoreTab({ ...history, index });
      else await openTab(destination);
    }
    if (!url && typeof saved.activeIndex === "number") activeTabId = [...tabs.keys()][saved.activeIndex] ?? activeTabId;
    syncBounds(); focusActive(); emit();
    return snapshot();
  }

  async function install(script: WebMCPScript): Promise<WebMCPInstallReceipt> {
    validateWebMCPScript(script);
    guestUrl(script.origin);
    const previous = scripts.get(script.origin);
    scripts.set(script.origin, script);
    const receipts: WebMCPPageReceipt[] = [];
    try {
      for (const tab of tabs.values()) {
        await tab.ready;
        await addScript(tab, script);
        if (tab.state.origin !== script.origin) continue;
        const documentId = tab.state.documentId;
        for (const [id, call] of calls) if (call.tabId === tab.state.id) await cancelCall(id, "WebMCP version changed; the operation result is unknown.");
        await evaluate(tab, webmcpBootstrap(script), true);
        const names = await evaluate(tab, "globalThis.__deepdeckWebMCP.registeredNames", true);
        if (tab.state.documentId !== documentId) throw new Error("The page navigated while WebMCP was being installed.");
        const parsed: unknown = typeof names === "string" ? JSON.parse(names) : names;
        const tools = tab.state.tools.filter(tool => tool.source === "deepdeck" && tool.revision === script.revision);
        if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((name): name is string => typeof name === "string" && name.startsWith("deepdeck_"))) throw new Error("WebMCP source did not synchronously register any tools.");
        receipts.push({ tabId: tab.state.id, documentId, revision: script.revision, registered: parsed, tools });
      }
      emit();
      return { installed: true, origin: script.origin, revision: script.revision, matched: receipts.length,
        registered: receipts.reduce((count, receipt) => count + receipt.tools.length, 0), failed: 0, tabs: receipts };
    } catch (error) {
      if (previous) scripts.set(script.origin, previous); else scripts.delete(script.origin);
      for (const tab of tabs.values()) {
        try {
          const registration = tab.scripts.get(script.origin);
          if (registration) { await send(tab, "Page.removeScriptToEvaluateOnNewDocument", { identifier: registration }); tab.scripts.delete(script.origin); }
          if (tab.state.origin === script.origin) await evaluate(tab, webmcpDispose(script.origin), true);
          if (previous) { await addScript(tab, previous); if (tab.state.origin === script.origin) await evaluate(tab, webmcpBootstrap(previous), true); }
        } catch { /* The tab may have closed during rollback. */ }
      }
      emit(); throw error;
    }
  }

  async function dispatch(command: BrowserNativeCommand): Promise<unknown> {
    switch (command.action) {
      case "snapshot": return snapshot();
      case "auth.respond": {
        const request = authentication.get(command.id);
        if (!request) throw new Error("Authentication request expired.");
        const credentials = command.credentials;
        if (credentials && (typeof credentials.username !== "string" || typeof credentials.password !== "string" || credentials.username.length > 4096 || credentials.password.length > 16384)) throw new Error("Invalid credentials.");
        authentication.delete(command.id); request.callback(credentials?.username, credentials?.password); emit();
        return reply(command.action, { ok: true });
      }
      case "page.menu.configure": {
        for (const key of Object.keys(PAGE_MENU_LABELS) as BrowserPageMenuAction[]) {
          if (typeof command.labels?.[key] !== 'string' || command.labels[key].length > 120) throw new Error('Invalid page menu labels.');
        }
        pageMenuLabels = { ...command.labels }; return reply(command.action, { ok: true });
      }
      case "page.selection.ack": {
        selections = selections.filter(selection => selection.id !== command.id);
        emit(); return reply(command.action, { ok: true });
      }
      case "open": return await open(command.shellUrl, command.url);
      case "devtools.open": {
        const tab = target(command); await tab.ready; target(command);
        const origin = tab.state.origin;
        if (!origin || !window) throw new Error("Open a website before using DevTools.");
        const lease = await createDevToolsLease(tab.contents, window, () => tabs.has(tab.state.id) && tab.state.origin === origin, id => {
          if (devtools.get(id)?.busy) busyTabs.delete(tab.state.id);
          devtools.delete(id);
        }, command.workspacePath);
        devtools.set(lease.id, { lease, tabId: tab.state.id, busy: false });
        return reply(command.action, { id: lease.id, wsEndpoint: lease.wsEndpoint, token: lease.token });
      }
      case "devtools.begin": {
        target(command);
        const entry = devtools.get(command.leaseId);
        if (!entry || entry.lease.closed || entry.tabId !== command.tabId) throw new Error("DevTools lease is closed or belongs to another tab. Discover DevTools again.");
        if (busyTabs.has(command.tabId)) throw new Error("This tab already has a running action.");
        busyTabs.add(command.tabId); entry.busy = true; return reply(command.action, { ok: true });
      }
      case "devtools.close":
      case "devtools.end": {
        const entry = devtools.get(command.leaseId);
        if (entry?.busy) { busyTabs.delete(entry.tabId); entry.busy = false; }
        if (command.action === "devtools.close") { entry?.lease.dispose(); devtools.delete(command.leaseId); }
        return reply(command.action, { ok: true });
      }
      case "tab.open": return await openTab(command.url, command.afterTabId);
      case "tab.reopen": {
        const saved = closedTabs.pop();
        if (saved) await restoreTab(saved);
        return snapshot();
      }
      case "tab.duplicate": {
        const tab = tabById(command.tabId);
        await restoreTab({ url: tab.state.url, index: [...tabs.keys()].indexOf(command.tabId) + 1,
          entries: tab.contents.navigationHistory.getAllEntries(), activeIndex: tab.contents.navigationHistory.getActiveIndex() });
        return snapshot();
      }
      case "tab.closeOthers":
      case "tab.closeRight": {
        tabById(command.tabId);
        const ids = [...tabs.keys()];
        const closingIds = command.action === "tab.closeOthers" ? ids.filter(id => id !== command.tabId) : ids.slice(ids.indexOf(command.tabId) + 1);
        // Closing from right to left preserves each saved tab's insertion index.
        for (const id of closingIds.reverse()) if (!await closeTab(id)) break;
        return snapshot();
      }
      case "tab.menu": {
        if (!window || window.isDestroyed()) throw new Error("Open Browser first.");
        if (!Array.isArray(command.items) || command.items.length > 20 || !Number.isFinite(command.x) || !Number.isFinite(command.y)) throw new Error("Invalid tab menu.");
        const allowed = new Set(["tab.move", "tab.mute", "tab.open", "tab.reopen", "tab.duplicate", "tab.close", "tab.closeOthers", "tab.closeRight", "tab.reload"]);
        const template: Electron.MenuItemConstructorOptions[] = command.items.map(item => {
          if ('type' in item && item.type === 'separator') return { type: 'separator' };
          if (!('command' in item) || !allowed.has(item.command.action) || typeof item.label !== 'string' || item.label.length > 120) throw new Error("Invalid tab menu item.");
          return { label: item.label, enabled: item.enabled !== false,
            ...(item.accelerator ? { accelerator: item.accelerator, registerAccelerator: false } : {}),
            click: () => { void execute(item.command).catch(error => console.error("Browser tab menu failed", error)); } };
        });
        tabMenu?.closePopup(window);
        const menu = Menu.buildFromTemplate(template);
        tabMenu = menu;
        const scale = shell?.webContents.getZoomFactor() ?? 1;
        menu.popup({ window, x: Math.round(command.x * scale), y: Math.round(command.y * scale),
          callback: () => { if (tabMenu === menu) tabMenu = undefined; } });
        return reply(command.action, { ok: true });
      }
      case "layout":
        if (!Number.isFinite(command.top) || !Number.isFinite(command.right)) throw new Error("Invalid Browser layout.");
        top = Math.max(0, Math.min(300, command.top)); right = Math.max(0, Math.min(1000, command.right)); syncBounds(); return snapshot();
      case "tab.activate": if (htmlFullscreenTab && htmlFullscreenTab !== command.tabId) leaveHtmlFullscreen(tabById(htmlFullscreenTab)); activeTabId = tabById(command.tabId).state.id; syncBounds(); focusActive(); emit(); persist(); return snapshot();
      case "tab.close": await closeTab(command.tabId); return snapshot();
      case "tab.navigate": {
        const tab = tabById(command.tabId); await tab.ready;
        void tab.contents.loadURL(guestUrl(command.url)).catch(error => navigationError(tab, error)); return snapshot();
      }
      case "tab.back": { const wc = tabById(command.tabId).contents; if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); return snapshot(); }
      case "tab.forward": { const wc = tabById(command.tabId).contents; if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); return snapshot(); }
      case "tab.reload": { const tab = tabById(command.tabId); await ensureProtocol(tab); tab.contents.reload(); } return snapshot();
      case "tab.stop": tabById(command.tabId).contents.stop(); return snapshot();
      case "find": {
        const tab = tabById(command.tabId);
        findInTab(tab, command.text, command.forward, command.next);
        const requestId = tab.findRequest;
        if (requestId !== undefined) await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); tab.contents.removeListener('found-in-page', found); resolve(); };
          const found = (_event: Electron.Event, result: Electron.Result) => { if (result.requestId === requestId && result.finalUpdate) finish(); };
          const timer = setTimeout(finish, 500);
          tab.contents.on('found-in-page', found);
        });
        return reply(command.action, { ok: true });
      }
      case "zoom": { setZoom(tabById(command.tabId), command.factor); return reply(command.action, { ok: true }); }
      case "tab.move": {
        if (!Number.isInteger(command.index)) throw new Error("Invalid tab position.");
        moveTab(tabById(command.tabId), command.index); persist(); return snapshot();
      }
      case "tab.mute": {
        if (typeof command.muted !== 'boolean') throw new Error('Invalid mute value.');
        const tab = tabById(command.tabId); tab.contents.setAudioMuted(command.muted); update(tab); return snapshot();
      }
      case "tab.devtools": {
        const wc = tabById(command.tabId).contents;
        if (wc.isDevToolsOpened()) wc.closeDevTools(); else wc.openDevTools({ mode: 'detach' });
        return reply(command.action, { ok: true });
      }
      case "tab.print": {
        const wc = tabById(command.tabId).contents;
        wc.print({ printBackground: true }, (success, reason) => { if (!success && reason !== 'cancelled') console.error('Browser print failed', reason); });
        return reply(command.action, { ok: true });
      }
      case "tab.save": {
        const tab = tabById(command.tabId); const documentId = tab.state.documentId;
        if (!window) throw new Error('Browser is closed.');
        const result = await dialog.showSaveDialog(window, { defaultPath: join(app.getPath('downloads'), `${(tab.state.title || 'page').replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 100)}.mhtml`),
          filters: [{ name: 'Web archive', extensions: ['mhtml'] }] });
        if (!result.canceled && result.filePath) { target({ tabId: tab.state.id, documentId }); await tab.contents.savePage(result.filePath, 'MHTML'); }
        return reply(command.action, { ok: true });
      }
      case "tab.siteInfo": await nativeSession.siteInfo(tabById(command.tabId).contents); return reply(command.action, { ok: true });
      case "download.control": await nativeSession.control(command); return reply(command.action, { ok: true });
      case "window.fullscreen": {
        if (window) window.setFullScreen(!window.isFullScreen());
        return reply(command.action, { ok: true });
      }
      case "webmcp.install": return await install(command.script);
      case "webmcp.remove": {
        scripts.delete(command.origin);
        for (const tab of tabs.values()) {
          if (tab.state.origin === command.origin) {
            for (const [id, call] of calls) if (call.tabId === tab.state.id) await cancelCall(id, "WebMCP was disabled; the operation result is unknown.");
          }
          const id = tab.scripts.get(command.origin);
          if (id) { await send(tab, "Page.removeScriptToEvaluateOnNewDocument", { identifier: id }); tab.scripts.delete(command.origin); }
          if (tab.state.origin === command.origin) await evaluate(tab, webmcpDispose(command.origin), true);
        }
        emit(); return reply(command.action, { removed: true });
      }
      case "webmcp.cancel": await cancelCall(command.callId); return reply(command.action, { cancelled: true });
      case "webmcp.call": {
        const tab = target(command); await tab.ready; target(command);
        const tool = tab.state.tools.find(tool => tool.frameId === command.frameId && tool.name === command.name);
        if (!tool || tool.documentId !== command.documentId || tool.revision !== command.revision) throw new Error("This WebMCP tool is stale or unavailable. Discover the tools again.");
        if (!command.callId || calls.has(command.callId)) throw new Error("Invalid or duplicate WebMCP call ID.");
        return await new Promise((resolve, reject) => {
          const pending: PendingCall = { tabId: command.tabId, documentId: command.documentId, resolve, reject,
            timer: setTimeout(() => { void cancelCall(command.callId, "WebMCP invocation timed out; its result is unknown. Do not automatically repeat actions."); }, TOOL_TIMEOUT_MS) };
          calls.set(command.callId, pending);
          void send(tab, "WebMCP.invokeTool", { frameId: command.frameId, toolName: command.name, input: command.input }).then(result => {
            pending.invocationId = result.invocationId;
            if (!calls.has(command.callId)) { void send(tab, "WebMCP.cancelInvocation", { invocationId: result.invocationId }).catch(() => undefined); return; }
            const responseKey = keyFor(tab.state.id, result.invocationId);
            const early = earlyResponses.get(responseKey);
            if (early) { earlyResponses.delete(responseKey); receiveResponse(tab, early); }
          }).catch(error => finishCall(command.callId, undefined, message(error)));
        });
      }
      case "page.screenshot": {
        const tab = target(command); await tab.ready; target(command);
        const result = await send(tab, "Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
        target(command); return reply(command.action, { image: `data:image/png;base64,${String(result.data)}`, documentId: command.documentId });
      }
      case "page.network": { const tab = target(command); return reply(command.action, { requests: tab.network, console: tab.console }); }
      case "page.inspect": {
        const tab = target(command); await tab.ready; target(command);
        const ax = await send(tab, "Accessibility.getFullAXTree");
        const content = await evaluate(tab, `({ title: document.title, url: location.href, text: document.body?.innerText.slice(0, 30000) ?? '', elements: [...document.querySelectorAll('a,button,input,select,textarea,[role="button"]')].slice(0,300).map(el => { const r=el.getBoundingClientRect(); return {tag:el.tagName, text:(el.innerText||el.getAttribute('aria-label')||'').slice(0,200), name:el.getAttribute('name'), type:el.getAttribute('type'), href:el.href, id:el.id, rect:{x:r.x,y:r.y,width:r.width,height:r.height}}; }) })`, true);
        target(command);
        return reply(command.action, { documentId: command.documentId, content: content as BrowserInspection['content'], accessibility: (ax.nodes ?? []).slice(0, 600), frames: [...tab.frames].map(([id, frame]) => ({ id, ...frame })), console: tab.console, tools: tab.state.tools });
      }
      case "page.evaluate": { const tab = target(command); await tab.ready; target(command); const value = await evaluate(tab, command.expression, true); target(command); return reply(command.action, { value }); }
      case "page.interact": {
        const tab = target(command); await tab.ready; target(command);
        if (command.kind === "click") {
          if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) throw new Error("Click needs viewport coordinates.");
          await send(tab, "Input.dispatchMouseEvent", { type: "mousePressed", x: command.x, y: command.y, button: "left", clickCount: 1 });
          await send(tab, "Input.dispatchMouseEvent", { type: "mouseReleased", x: command.x, y: command.y, button: "left", clickCount: 1 });
        } else if (command.kind === "type") {
          if (typeof command.text !== "string" || command.text.length > 50_000) throw new Error("Invalid input text.");
          await send(tab, "Input.insertText", { text: command.text });
        } else if (command.kind === "key") {
          if (typeof command.key !== "string" || command.key.length > 40) throw new Error("Invalid key.");
          const codes: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Delete: 46 };
          await send(tab, "Input.dispatchKeyEvent", { type: "keyDown", key: command.key, windowsVirtualKeyCode: codes[command.key] ?? 0, ...(command.key === "Enter" ? { text: "\r" } : {}) });
          await send(tab, "Input.dispatchKeyEvent", { type: "keyUp", key: command.key });
        } else if (command.kind === "scroll") {
          if (!Number.isFinite(command.deltaY ?? 0) || !Number.isFinite(command.deltaX ?? 0)) throw new Error("Invalid scroll distance.");
          await send(tab, "Input.dispatchMouseEvent", { type: "mouseWheel", x: command.x ?? 100, y: command.y ?? 100, deltaX: command.deltaX ?? 0, deltaY: command.deltaY ?? 500 });
        } else throw new Error("Unknown page interaction.");
        return reply(command.action, { ok: true, documentId: tab.state.documentId, navigated: tab.state.documentId !== command.documentId });
      }
      default: throw new Error("Unknown Browser command.");
    }
  }
  async function executeNative(command: BrowserNativeCommand): Promise<unknown> {
    if (command.action === "webmcp.install" || command.action === "webmcp.remove") {
      const origin = command.action === "webmcp.install" ? command.script.origin : command.origin;
      if (!origin || browserOrigin(browserUrl(origin)) !== origin) throw new Error("Invalid WebMCP origin.");
      const operation = (mutations.get(origin) ?? Promise.resolve()).then(() => dispatch(command));
      const settled = operation.then(() => undefined, () => undefined);
      mutations.set(origin, settled);
      try { return await operation; }
      finally { if (mutations.get(origin) === settled) mutations.delete(origin); }
    }
    if (command.action !== "webmcp.call" && command.action !== "page.evaluate" && command.action !== "page.interact") return await dispatch(command);
    target(command);
    if (busyTabs.has(command.tabId)) throw new Error("This tab already has a running action. Wait for it to finish or cancel it before starting another action.");
    busyTabs.add(command.tabId);
    try { return await dispatch(command); }
    finally { busyTabs.delete(command.tabId); }
  }
  async function execute<C extends BrowserNativeCommand>(command: C): Promise<BrowserNativeResponse<C>> {
    return await executeNative(command) as BrowserNativeResponse<C>;
  }
  return {
    execute, snapshot,
    async restoreShell(baseUrl) {
      if (!window || window.isDestroyed() || !shell || shell.webContents.isDestroyed()) return;
      const destination = new URL("/?deepdeck-surface=browser", baseUrl).href;
      if (destination === shellUrl) return;
      shellUrl = destination;
      await shell.webContents.loadURL(destination);
      emit();
    },
    dispose() {
      persist(); closing = true;
      for (const { lease } of devtools.values()) lease.dispose();
      devtools.clear();
      for (const id of [...calls.keys()]) void cancelCall(id, "Browser closed; the operation result is unknown.");
      nativeSession.dispose();
      if (window && !window.isDestroyed()) window.destroy();
    },
  };
}
