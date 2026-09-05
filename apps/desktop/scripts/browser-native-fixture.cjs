const { app, BaseWindow, webContents } = require("electron");
const http = require("node:http");
const assert = require("node:assert/strict");
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath("userData", process.env.DEEPDECK_BROWSER_TEST_PROFILE);
const servers = [];
// Surface native popup failures as test failures instead of opening a modal.
process.on("uncaughtException", error => { console.error(error); app.exit(1); });
let requestedFocus;
// Keep checking the actual native focus destination even when the OS refuses to
// activate a CLI-launched Electron process (for example a background CI worker).
app.on("web-contents-created", (_event, contents) => {
  const focus = contents.focus.bind(contents);
  contents.focus = () => { requestedFocus = contents; focus(); };
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = read();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function serve(html) {
  return await new Promise(resolve => {
    const server = http.createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      response.setHeader("Content-Type", "text/html"); response.end(typeof html === "function" ? html(request.url, request, body) : html);
    });
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}
function toolCall(tab, name, callId) {
  const tool = tab.tools.find(tool => tool.name === name);
  assert(tool, `Missing tool ${name}`);
  return { action: "webmcp.call", tabId: tab.id, documentId: tab.documentId, frameId: tool.frameId,
    name, input: {}, callId, ...(tool.revision ? { revision: tool.revision } : {}) };
}

(async () => {
  await app.whenReady();
  const shell = await serve("<title>Browser verification</title>");
  const site = await serve(`<title>WebMCP Site</title><button id="hello">Hello world</button>
    <script>document.modelContext.registerTool({name:'site_echo',description:'Echo',inputSchema:{type:'object'},
      execute:async()=>({content:[{type:'text',text:'Original site tool'}]})});</script>`);
  const other = await serve("<title>Another origin</title>");
  let current;
  const manager = createBrowserWindowManager("Browser verification", value => { current = value; });
  const source = `__deepdeckWebMCP.registerTool({name:'page_title',description:'Read title',inputSchema:{type:'object'},
    execute:async()=>({content:[{type:'text',text:document.title}]})});`;
  try {
    const staged = await manager.execute({ action: "webmcp.install", script: { origin: site, revision: "v1", source } });
    assert.equal(staged.matched, 0);
    await manager.execute({ action: "open", shellUrl: `${shell}/?deepdeck-surface=browser` });
    const shellContents = webContents.getAllWebContents().find(contents => contents.getURL() === `${shell}/?deepdeck-surface=browser`);
    assert(shellContents);
    const inForeground = () => BaseWindow.getAllWindows()[0]?.isFocused();
    const focusId = () => inForeground() ? webContents.getFocusedWebContents()?.id : requestedFocus?.id;
    assert.equal(focusId(), shellContents.id, "new blank tab focuses the trusted shell");
    await manager.execute({ action: "tab.navigate", tabId: current.activeTabId, url: site });
    let tab = await until(() => current.tabs.find(tab => !tab.loading && tab.tools.length === 2), "native discovery plus saved WebMCP on first load");
    assert.equal(tab.tools.find(tool => tool.name === "site_echo").source, "site");
    assert.equal(tab.tools.find(tool => tool.name === "deepdeck_page_title").source, "deepdeck");
    assert.match(JSON.stringify(await manager.execute(toolCall(tab, "site_echo", "site-call"))), /Original site tool/);
    assert.match(JSON.stringify(await manager.execute(toolCall(tab, "deepdeck_page_title", "generated-call"))), /WebMCP Site/);
    const inspected = await manager.execute({ action: "page.inspect", tabId: tab.id, documentId: tab.documentId });
    assert.match(inspected.content.text, /Hello world/);
    const image = await manager.execute({ action: "page.screenshot", tabId: tab.id, documentId: tab.documentId });
    assert.match(image.image, /^data:image\/png;base64,/);

    await assert.rejects(manager.execute({ action: "webmcp.install", script: { origin: site, revision: "v2", source: "throw new Error('bad update')" } }), /bad update/);
    tab = await until(() => current.tabs.find(tab => tab.tools.some(tool => tool.name === "deepdeck_page_title" && tool.revision === "v1")), "failed update rollback");
    assert.match(JSON.stringify(await manager.execute(toolCall(tab, "deepdeck_page_title", "rollback-call"))), /WebMCP Site/);
    const oldDocument = tab.documentId;
    await manager.execute({ action: "page.evaluate", tabId: tab.id, documentId: oldDocument, expression: "history.pushState({}, '', '/next')" }).catch(() => undefined);
    await until(() => current.tabs[0].documentId !== oldDocument, "SPA target invalidation");
    await assert.rejects(manager.execute({ action: "page.inspect", tabId: tab.id, documentId: oldDocument }), /page changed/);
    await manager.execute({ action: "webmcp.remove", origin: site });
    await until(() => current.tabs[0].tools.length === 1 && current.tabs[0].tools[0].name === "site_echo", "remove only generated tools");

    await manager.execute({ action: "webmcp.install", script: { origin: site, revision: "v3", source: `
      __deepdeckWebMCP.registerTool({name:'slow',description:'Cancellable tool',inputSchema:{type:'object'},
        execute:async()=>new Promise(resolve=>setTimeout(()=>resolve('done'),30000))});` } });
    tab = current.tabs[0];
    const running = manager.execute(toolCall(tab, "deepdeck_slow", "slow-call"));
    const cancelled = assert.rejects(running, /cancelled/);
    await assert.rejects(manager.execute({ action: "page.interact", tabId: tab.id, documentId: tab.documentId, kind: "click", x: 10, y: 10 }), /running action/);
    await delay(50);
    await manager.execute({ action: "webmcp.cancel", callId: "slow-call" });
    await cancelled;
    await manager.execute({ action: "tab.reload", tabId: tab.id });
    await until(() => current.tabs[0].documentId !== tab.documentId && !current.tabs[0].loading && current.tabs[0].tools.some(tool => tool.name === "deepdeck_slow" && tool.revision === "v3"), "reload auto-injection");
    await manager.execute({ action: "tab.open", url: site });
    await until(() => current.tabs.length === 2 && current.tabs[1].tools.some(tool => tool.name === "deepdeck_slow" && tool.source === "deepdeck"), "same-site second tab");
    await assert.rejects(manager.execute({ action: "tab.navigate", tabId: current.tabs[1].id, url: shell }), /Harness application/);
    await manager.execute({ action: "tab.navigate", tabId: current.tabs[1].id, url: other });
    await until(() => current.tabs[1].origin === other && !current.tabs[1].loading, "cross-origin navigation");
    assert.equal(current.tabs[1].tools.length, 0);

    const frameSite = await serve(path => path.startsWith("/frame")
      ? `<script>
          let executions = 0;
          document.modelContext.registerTool({name:'frame_echo',description:'Frame version',inputSchema:{type:'object'},
            execute:async()=>({content:[{type:'text',text:JSON.stringify({version:location.search,count:++executions})}]})});
          document.modelContext.registerTool({name:'frame_wait',description:'Wait in child frame',inputSchema:{type:'object'},
            execute:async()=>new Promise(resolve=>setTimeout(()=>resolve('done'),5000))});
        </script>`
      : `<title>Frame Parent</title><iframe id="child" src="/frame?version=1"></iframe><script>
          document.modelContext.registerTool({name:'parent_keep',description:'Parent tool',inputSchema:{type:'object'},
            execute:async()=>({content:[{type:'text',text:'Parent unchanged'}]})});
        </script>`);
    await manager.execute({ action: "webmcp.install", script: { origin: frameSite, revision: "frames-v1", source } });
    await manager.execute({ action: "tab.open", url: frameSite });
    let frameTab = await until(() => current.tabs.find(tab => tab.origin === frameSite && !tab.loading && tab.tools.length === 4), "iframe tool discovery");
    const staleFrameCall = toolCall(frameTab, "frame_echo", "old-frame-call");
    const parentDocumentId = frameTab.documentId;
    const oldFrameId = staleFrameCall.frameId;
    await manager.execute({ action: "page.evaluate", tabId: frameTab.id, documentId: frameTab.documentId,
      expression: "setTimeout(() => { document.getElementById('child').src = '/frame?version=2'; }, 150)" });
    await assert.rejects(manager.execute(toolCall(frameTab, "frame_wait", "frame-navigation-cancel")), /frame changed|invocation Error/);
    frameTab = await until(() => current.tabs.find(tab => tab.id === frameTab.id && tab.documentId !== parentDocumentId && !tab.loading && tab.tools.length === 4), "iframe navigation with unchanged parent");
    assert.equal(frameTab.tools.find(tool => tool.name === "frame_echo").frameId, oldFrameId, "the iframe navigation must exercise frame ID reuse");
    await assert.rejects(manager.execute(staleFrameCall), /page changed/);
    const newFrameResult = await manager.execute(toolCall(frameTab, "frame_echo", "new-frame-call"));
    const frameResult = JSON.parse(newFrameResult.content[0].text);
    assert.deepEqual(frameResult, { version: "?version=2", count: 1 }, "the stale call must not execute against the new frame");
    assert(frameTab.tools.every(tool => tool.documentId === frameTab.documentId));
    assert.equal(frameTab.tools.find(tool => tool.name === "deepdeck_page_title").revision, "frames-v1");
    assert.equal(frameTab.tools.find(tool => tool.name === "deepdeck_page_title").source, "deepdeck");
    assert.match(JSON.stringify(await manager.execute(toolCall(frameTab, "parent_keep", "parent-after-frame-navigation"))), /Parent unchanged/);
    assert.match(JSON.stringify(await manager.execute(toolCall(frameTab, "deepdeck_page_title", "generated-after-frame-navigation"))), /Frame Parent/);
    const detachedCall = toolCall(frameTab, "frame_echo", "detached-frame-call");
    const beforeDetach = frameTab.documentId;
    await manager.execute({ action: "page.evaluate", tabId: frameTab.id, documentId: frameTab.documentId,
      expression: "document.getElementById('child').remove()" }).catch(() => undefined);
    frameTab = await until(() => current.tabs.find(tab => tab.id === frameTab.id && tab.documentId !== beforeDetach && tab.tools.length === 2), "iframe detach invalidation");
    await assert.rejects(manager.execute(detachedCall), /page changed/);
    assert.deepEqual(frameTab.tools.map(tool => tool.name).sort(), ["deepdeck_page_title", "parent_keep"]);

    await manager.execute({ action: "tab.activate", tabId: frameTab.id });
    const frameContents = webContents.getAllWebContents().find(contents => contents.getURL() === `${frameSite}/`);
    await until(() => focusId() === frameContents.id, "a visible site tab receives focus");
    shellContents.focus();
    await manager.execute({ action: "page.evaluate", tabId: frameTab.id, documentId: frameTab.documentId,
      expression: "document.title = 'Frame Parent Updated'" });
    await until(() => current.tabs.find(tab => tab.id === frameTab.id).title === "Frame Parent Updated", "title change state update");
    assert.equal(focusId(), shellContents.id, "a page update must not steal address/composer focus");
    await manager.execute({ action: "tab.activate", tabId: frameTab.id });
    const unreachable = await serve("");
    await new Promise(resolve => servers.at(-1).close(resolve));
    await manager.execute({ action: "tab.navigate", tabId: frameTab.id, url: unreachable });
    await until(() => current.tabs.find(tab => tab.id === frameTab.id).error, "failed page recovery state");
    if (inForeground()) await until(() => focusId() === shellContents.id, "a focused guest that fails returns focus to the shell");
    await manager.execute({ action: "tab.open" });
    await until(() => focusId() === shellContents.id, "opening another blank tab retains shell focus");
    await manager.execute({ action: "tab.activate", tabId: current.tabs[0].id });
    const firstContents = inForeground() ? webContents.getFocusedWebContents() : requestedFocus;
    assert.notEqual(firstContents.id, shellContents.id);
    if (inForeground()) {
      firstContents.sendInputEvent({ type: "keyDown", keyCode: "Tab", modifiers: ["control", "shift"] });
      firstContents.sendInputEvent({ type: "keyUp", keyCode: "Tab", modifiers: ["control", "shift"] });
    } else {
      firstContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key: "Tab", control: true, shift: true });
    }
    await until(() => current.activeTabId === current.tabs.at(-1).id && focusId() === shellContents.id, "Ctrl+Shift+Tab to a blank tab focuses shell");
    await manager.execute({ action: "tab.activate", tabId: frameTab.id });
    assert.equal(focusId(), shellContents.id, "activating a failed tab focuses shell");

    const loginRequests = [];
    const login = await serve((path, request, body) => {
      if (path === "/posted") loginRequests.push({ method: request.method, body });
      return path === "/" ? `<title>Login opener</title>
      <button id="login" onclick="window.loginPopup=window.open('/login','login')">Login</button>
      <button id="blank" onclick="window.loginPopup=window.open('about:blank','login');setTimeout(()=>loginPopup.location='/login',100)">Deferred login</button>
      <a id="link" href="/login" target="_blank">Open login</a>
      <form id="form" action="/posted" method="post" target="_blank"><input name="token" value="fixture"></form>
      <script>document.cookie='popup_profile=shared; path=/';window.messages=[];
        addEventListener('message',event=>messages.push(event.data));</script>`
      : `<title>Login popup</title><button id="finish" onclick="opener.postMessage('login-complete',location.origin);window.close()">Finish</button>
        <script>document.modelContext.registerTool({name:'login_status',description:'Check login popup',inputSchema:{type:'object'},
          execute:async()=>({cookie:document.cookie,hasOpener:!!opener,node:typeof process})});</script>`;
    });
    await manager.execute({ action: "webmcp.install", script: { origin: login, revision: "login-v1", source } });
    await manager.execute({ action: "tab.open", url: login });
    const opener = await until(() => current.tabs.find(tab => tab.origin === login && !tab.loading), "login opener");
    const pageEval = (id, expression) => {
      const currentTab = current.tabs.find(tab => tab.id === id);
      return manager.execute({ action: "page.evaluate", tabId: id, documentId: currentTab.documentId, expression }).then(result => result.value);
    };
    const openerContents = webContents.getAllWebContents().find(contents => contents.getURL() === `${login}/`);
    const openerValue = async expression => (await openerContents.debugger.sendCommand("Runtime.evaluate", { expression, returnByValue: true })).result.value;
    for (const button of ["login", "blank"]) {
      await pageEval(opener.id, `document.getElementById('${button}').click()`);
      const popup = await until(() => current.tabs.find(tab => tab.id !== opener.id && tab.origin === login && !tab.loading && tab.tools.length === 2), `${button} popup and WebMCP`);
      const result = await manager.execute(toolCall(popup, "login_status", `${button}-status`));
      assert.deepEqual(result, { cookie: "popup_profile=shared", hasOpener: true, node: "undefined" });
      assert.match(JSON.stringify(await manager.execute(toolCall(popup, "deepdeck_page_title", `${button}-generated`))), /Login popup/);
      await pageEval(popup.id, "document.getElementById('finish').click()").catch(() => undefined);
      await until(() => !current.tabs.some(tab => tab.id === popup.id), "script-closed login popup removed");
      assert.equal(await openerValue("loginPopup.closed"), true);
    }
    assert.deepEqual(await openerValue("messages"), ["login-complete", "login-complete"], "login callbacks reach the original opener");
    await pageEval(opener.id, "document.getElementById('link').click()");
    const linkTab = await until(() => current.tabs.find(tab => tab.id !== opener.id && tab.origin === login && !tab.loading && tab.tools.length === 2), "target blank link");
    assert.equal(await pageEval(linkTab.id, "opener === null"), true, "links retain Chromium's noopener behavior");
    await manager.execute({ action: "tab.close", tabId: linkTab.id });
    await pageEval(opener.id, "document.getElementById('form').requestSubmit()");
    const formTab = await until(() => current.tabs.find(tab => tab.url === `${login}/posted` && !tab.loading && tab.tools.length === 2), "form target blank");
    assert.deepEqual(loginRequests, [{ method: "POST", body: "token=fixture" }], "popup form submits once with its original body");
    await manager.execute({ action: "tab.close", tabId: formTab.id });
    await manager.execute({ action: "tab.activate", tabId: opener.id });
    // Wait for the reactivated native view's compositor before coordinate input;
    // DOM layout alone can be ready while its hit-test surface is still hidden.
    await openerContents.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
    const point = await pageEval(opener.id, "(()=>{const r=document.getElementById('link').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
    await openerContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "middle", clickCount: 1 });
    await openerContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "middle", clickCount: 1 });
    const background = await until(() => current.tabs.find(tab => tab.id !== opener.id && tab.origin === login && !tab.loading && tab.tools.length === 2), "middle-click background navigation");
    assert.equal(current.activeTabId, opener.id, "a background link must retain the active tab");
    await manager.execute({ action: "tab.close", tabId: background.id });
    // Tab commands operate on the target, not whichever tab currently has focus.
    await manager.execute({ action: "tab.closeOthers", tabId: opener.id });
    const left = current.activeTabId;
    await manager.execute({ action: "tab.open", url: other });
    const right = current.activeTabId;
    await manager.execute({ action: "tab.open", url: site, afterTabId: left });
    const middle = current.activeTabId;
    await until(() => current.tabs.find(tab => tab.id === middle && !tab.loading && tab.tools.length === 2), "middle tab navigation");
    assert.deepEqual(current.tabs.map(tab => tab.id), [left, middle, right], "new tab to right inserts beside its target");
    await manager.execute({ action: "tab.navigate", tabId: middle, url: site + "/second" });
    await until(() => current.tabs.find(tab => tab.id === middle && tab.url.endsWith("/second") && !tab.loading), "second history entry");
    await manager.execute({ action: "tab.close", tabId: middle });
    assert.equal(current.activeTabId, right, "closing current tab selects its right neighbour");
    await manager.execute({ action: "tab.reopen" });
    const restored = await until(() => current.tabs.find(tab => tab.id === current.activeTabId && tab.url.endsWith("/second") && !tab.loading && tab.tools.length === 2), "reopen closed tab and WebMCP");
    assert.equal(current.tabs[1].id, restored.id, "reopen restores the tab position");
    assert(restored.canGoBack, "reopen restores navigation history");
    await manager.execute({ action: "tab.duplicate", tabId: restored.id });
    const duplicate = await until(() => current.tabs.find(tab => tab.id === current.activeTabId && tab.url.endsWith("/second") && !tab.loading && tab.tools.length === 2), "duplicate tab and WebMCP");
    assert.equal(current.tabs[2].id, duplicate.id);
    assert(duplicate.canGoBack, "duplicate preserves navigation history");
    await manager.execute({ action: "tab.activate", tabId: left });
    await manager.execute({ action: "tab.closeRight", tabId: restored.id });
    assert.deepEqual(current.tabs.map(tab => tab.id), [left, restored.id]);
    assert.equal(current.activeTabId, left, "closing background tabs retains foreground focus");
    await manager.execute({ action: "tab.closeOthers", tabId: restored.id });
    assert.deepEqual(current.tabs.map(tab => tab.id), [restored.id]);
    assert.equal(current.activeTabId, restored.id);
    await manager.execute({ action: "tab.open" });
    const blankShortcut = current.activeTabId;
    const input = (contents, key, extra = {}) => contents.emit("before-input-event", { preventDefault() {} },
      { type: "keyDown", key, ...(process.platform === "darwin" ? { meta: true } : { control: true }), ...extra });
    input(shellContents, "1");
    assert.equal(current.activeTabId, restored.id, "direct tab shortcut works from shell");
    const restoredContents = webContents.getAllWebContents().find(contents => contents.getURL() === site + "/second");
    input(restoredContents, "9");
    assert.equal(current.activeTabId, blankShortcut, "last-tab shortcut works from website");
    input(shellContents, "w");
    await until(() => current.tabs.length === 1, "shell close shortcut completes beforeunload and closes a tab rather than window");
    input(shellContents, "T", { shift: true });
    await until(() => current.tabs.length === 2 && current.activeTabId !== restored.id, "shell reopen shortcut");
    assert(current.open);
    input(shellContents, "Tab", { meta: false, control: true, shift: true });
    assert.equal(current.activeTabId, restored.id, "shell Ctrl+Shift+Tab cycles just like a website");
    console.log("PASS Browser tabs: adjacent insertion/selection, close others/right, duplicate and reopen with history, direct/last-tab selection, shell and guest shortcuts.");
    if (!inForeground()) console.log("Browser focus verification used native focus-call tracing; OS foreground assertions are enabled when the fixture has foreground focus.");
    console.log("PASS Browser native: discovery, merge, invocation, inspect, screenshot, staged first load, update rollback, SPA invalidation, removal, cancellation, conflict rejection, reload, multiple tabs, origin isolation, iframe navigation and detach invalidation, blank/error/site focus, native tab shortcuts, login popups, opener callbacks, shared profile, script close, target blank links/forms and background links.");
  } finally {
    manager.dispose();
    for (const server of servers) server.close();
    app.quit();
  }
})().catch(error => { console.error(error); app.exit(1); });
