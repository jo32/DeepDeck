const { app, BaseWindow, webContents, dialog, session, shell } = require('electron');
const http = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
app.on('window-all-closed', () => {});
const assets = process.env.DEEPDECK_BROWSER_CORE_ASSETS;
const deadline = setTimeout(() => { console.error('Browser core verification exceeded two minutes'); app.exit(1); }, 120000);
const trace = (...values) => { if (process.env.DEEPDECK_BROWSER_CORE_TRACE) console.log(...values); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let count = 0; count < 150; count++) { const value = await read(); if (value) return value; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
const servers = [];
async function serve(handler) {
  return new Promise(resolve => { const server = http.createServer(handler); servers.push(server); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}
async function evaluate(wc, expression) {
  const value = await wc.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert(!value.exceptionDetails, JSON.stringify(value.exceptionDetails)); return value.result.value;
}
const page = `<meta charset="utf-8"><title>Browser core fixture</title><style>body{font:20px system-ui;padding:32px}button{padding:15px}p{margin:25px 0}</style>
  <p>Needle one. Needle two. Needle three.</p><button id="edit">Edit unsaved document</button>
  <button id="full">Full screen</button><input type="file" id="upload"><a href="/download" download>Download test file</a>
  <script>document.getElementById('edit').onclick=()=>{window.onbeforeunload=e=>{e.preventDefault();e.returnValue=''}};
  document.getElementById('full').onclick=()=>document.documentElement.requestFullscreen();
  document.modelContext.registerTool({name:'core_echo',description:'Echo',inputSchema:{type:'object'},execute:async()=>({ok:true})});</script>`;
(async () => {
  await app.whenReady();
  const site = await serve((req, res) => {
    if (req.url.startsWith('/protected') && req.headers.authorization !== 'Basic ' + Buffer.from('fixture:secret').toString('base64')) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Fixture"' }); res.end('Authentication required'); return; }
    if (req.url.startsWith('/download')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="fixture.bin"', 'Content-Length': 4 * 1024 * 1024, 'Accept-Ranges': 'bytes' });
      let sent = 0; const timer = setInterval(() => { const bytes = Buffer.alloc(64 * 1024, 42); res.write(bytes); sent += bytes.length; if (sent === 4 * 1024 * 1024) { clearInterval(timer); res.end(); } }, 40);
      res.on('close', () => clearInterval(timer)); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page);
  });
  let current; let manager;
  const host = await serve(async (req, res) => {
    if (req.url === '/api' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      try {
        const input = JSON.parse(body);
        const value = input.action === 'state' ? { available: true, native: manager.snapshot(), sites: [] }
          : input.action === 'command' ? await manager.execute(input.command) : undefined;
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value));
      } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
      return;
    }
    if (req.url === '/client.js' || req.url === '/client.css') { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(readFileSync(join(assets, req.url.slice(1)))); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<title>DeepDeck Browser core verification</title><link rel="stylesheet" href="/client.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/client.js"></script>');
  });
  manager = createBrowserWindowManager('Browser core verification', value => { current = value; });
  let unloadDecision = 0; let unloadPrompts = 0; let permissionPrompts = 0;
  const originalSync = dialog.showMessageBoxSync; const originalDialog = dialog.showMessageBox;
  const originalSave = dialog.showSaveDialog;
  // Dialog responses are controlled in this isolated fixture, not bypassed in production.
  dialog.showMessageBoxSync = () => { unloadPrompts++; return unloadDecision; };
  dialog.showMessageBox = async (_window, options) => { permissionPrompts++; return { response: options.title === 'Site information' ? 1 : 1, checkboxChecked: true }; };
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(assets, 'saved.mhtml') });
  try {
    await manager.execute({ action: 'open', shellUrl: host });
    const wc = webContents.getAllWebContents().find(wc => wc.getURL().startsWith(host));
    wc.debugger.attach('1.3');
    app.focus({ steal: true }); BaseWindow.getAllWindows()[0].focus();
    const has = label => evaluate(wc, `!!document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']')`);
    const click = async label => {
      await until(() => has(label), `UI ${label}`);
      wc.focus();
      await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
      const rect = await evaluate(wc, `(()=>{const e=document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
      assert(rect.width >= 24 && rect.height >= 24, `Usable target: ${label}`);
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    };
    await until(() => has('New tab search'), 'empty start page');
    assert.equal(await has('Hide Agent'), false);
    await click('Search or enter a website');
    await wc.debugger.sendCommand('Input.insertText', { text: site });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    const tab = await until(() => current.tabs.find(tab => tab.origin === site && !tab.loading && tab.tools.length), 'address navigation with WebMCP').catch(async error => { console.error(current, await evaluate(wc, `({active:document.activeElement?.outerHTML,text:document.body.innerText,input:document.querySelector('input')?.value})`)); throw error; });
    const guest = webContents.getAllWebContents().find(wc => wc.getURL().startsWith(site));
    guest.debugger.on('message', (_event, method, params) => { if (method.includes('javascriptDialog')) trace('DIALOG', method, params); });
    guest.on('will-prevent-unload', event => trace('BEFORE_UNLOAD', event.defaultPrevented));
    guest.on('found-in-page', (_event, value) => { if (process.env.DEEPDECK_BROWSER_CORE_TRACE) console.log('FIND', value); });
    const win = BaseWindow.getAllWindows()[0];
    const view = win.contentView.children.find(view => view.webContents === guest);
    await click('Hide Agent'); await until(() => view.getBounds().width === win.getContentSize()[0], 'collapsed Agent gives page full width');
    await click('Browser tools');
    await until(() => evaluate(wc, `!!document.querySelector('[role="toolbar"]')`), 'tools opened');
    await click('Zoom in'); await until(() => current.tabs.find(item => item.id === tab.id)?.zoomFactor > 1, 'native zoom');
    const zoomed = guest.getZoomFactor(); assert(Math.abs(zoomed - 1.1) < .001);
    await click('Reset zoom'); await until(() => Math.abs(guest.getZoomFactor() - 1) < .001, 'zoom reset badge');
    // A real native keyboard shortcut focuses the plugin find input from the guest.
    guest.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
    guest.sendInputEvent({ type: 'keyUp', keyCode: 'F', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
    await until(() => evaluate(wc, `document.activeElement?.getAttribute('aria-label') === 'Find in page'`), 'guest Cmd/Ctrl+F focuses find');
    await wc.debugger.sendCommand('Input.insertText', { text: 'Needle' });
    await until(() => current.tabs.find(item => item.id === tab.id)?.find?.matches === 3, 'incremental search matches').catch(async error => { console.error(current.tabs, await evaluate(wc, `({active:document.activeElement?.outerHTML,find:[...document.querySelectorAll('input')].map(e=>e.value),text:document.body.innerText})`)); throw error; });
    await click('Next match'); await until(() => current.tabs.find(item => item.id === tab.id)?.find?.activeMatch === 2, 'next search result');
    await until(() => evaluate(wc, `document.querySelector('[role="status"]')?.textContent.includes('2 / 3')`), 'visible find result count');
    if (process.env.DEEPDECK_BROWSER_CORE_SCREENSHOTS) writeFileSync('/tmp/deepdeck-browser-tools.png', Buffer.from((await wc.debugger.sendCommand('Page.captureScreenshot', {format:'png'})).data, 'base64'));
    await click('Previous match'); await until(() => current.tabs.find(item => item.id === tab.id)?.find?.activeMatch === 1, 'previous search result');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await until(() => !current.tabs.find(item => item.id === tab.id)?.find, 'Escape clears search');
    assert(view.getBounds().y > 100, 'native page stays below expanded tools');
    await manager.execute({ action: 'tab.mute', tabId: tab.id, muted: true });
    await until(() => has('Unmute tab'), 'mute indicator'); assert(guest.isAudioMuted());
    await click('Unmute tab'); await until(() => !guest.isAudioMuted(), 'unmute via indicator');
    await manager.execute({ action: 'tab.open', url: `${site}/second` });
    const second = current.activeTabId;
    await until(() => current.tabs.find(item => item.id === second && !item.loading), 'second tab');
    await manager.execute({ action: 'tab.move', tabId: second, index: 0 }); assert.equal(current.tabs[0].id, second);
    await manager.execute({ action: 'tab.activate', tabId: tab.id });
    await manager.execute({ action: 'zoom', tabId: tab.id, factor: 1.5 });
    assert(current.tabs.every(item => Math.abs(item.zoomFactor - 1.5) < .001), 'same-host native zoom and snapshots match');
    await manager.execute({ action: 'tab.save', tabId: tab.id }); assert(existsSync(join(assets, 'saved.mhtml'))); assert(readFileSync(join(assets, 'saved.mhtml'), 'utf8').includes('Needle'));
    await manager.execute({ action: 'tab.devtools', tabId: tab.id }); await until(() => guest.isDevToolsOpened(), 'user DevTools opened');
    await manager.execute({ action: 'tab.devtools', tabId: tab.id }); await delay(150);
    await manager.execute({ action: 'tab.reload', tabId: tab.id });
    await until(() => current.tabs.find(item => item.id === tab.id && !item.loading && item.tools.some(tool => tool.name === 'core_echo')), 'WebMCP recovers after user DevTools');
    // Downloads use the Chromium transfer and temporary destination; no user files/apps.
    const profile = session.fromPartition('persist:deepdeck-browser');
    profile.on('will-download', (_event, item) => item.setSavePath(join(assets, `download-${Date.now()}.bin`)));
    guest.downloadURL(`${site}/download`);
    const download = await until(() => current.downloads.find(item => item.receivedBytes > 0 && item.state === 'progressing'), 'active transfer');
    await manager.execute({ action: 'download.control', id: download.id, operation: 'pause' }); assert(current.downloads[0].paused);
    await manager.execute({ action: 'download.control', id: download.id, operation: 'resume' });
    await until(() => current.downloads.find(item => item.id === download.id && item.state === 'completed'), 'download completes');
    await click('Downloads'); await until(() => has('Hide Agent'), 'downloads panel expanded');
    await until(() => evaluate(wc, `document.body.innerText.includes('fixture.bin') && document.body.innerText.includes('Completed') && document.body.innerText.includes('Open file')`), 'completed download UI');
    if (process.env.DEEPDECK_BROWSER_CORE_SCREENSHOTS) writeFileSync('/tmp/deepdeck-browser-downloads.png', Buffer.from((await wc.debugger.sendCommand('Page.captureScreenshot', {format:'png'})).data, 'base64'));
    guest.downloadURL(`${site}/download?cancel`);
    const cancelled = await until(() => current.downloads.find(item => item.id !== download.id && item.state === 'progressing'), 'second transfer');
    await manager.execute({ action: 'download.control', id: cancelled.id, operation: 'cancel' });
    await until(() => current.downloads.find(item => item.id === cancelled.id && item.state === 'cancelled'), 'cancel transfer');
    const realOpen = shell.openPath; let opened;
    shell.openPath = async path => { opened = path; return ''; };
    try { await manager.execute({ action: 'download.control', id: download.id, operation: 'open' }); assert(existsSync(opened)); }
    finally { shell.openPath = realOpen; }
    // Permission check + request share one remembered decision, reset returns to prompt.
    await evaluate(guest, `Notification.requestPermission()`); const grantedPrompts = permissionPrompts;
    assert.equal(await evaluate(guest, `Notification.permission`), 'granted');
    await evaluate(guest, `Notification.requestPermission()`); assert.equal(permissionPrompts, grantedPrompts);
    await manager.execute({ action: 'tab.siteInfo', tabId: tab.id });
    // beforeunload needs a real user activation, supplied by CDP mouse input.
    guest.focus(); await guest.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
    const edit = await evaluate(guest, `(()=>{const r=document.getElementById('edit').getBoundingClientRect();return{x:r.x+10,y:r.y+10}})()`);
    await evaluate(guest, `window.__clicked = []; document.addEventListener('click', event => window.__clicked.push({id:event.target.id,x:event.clientX,y:event.clientY}), true)`);
    await guest.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...edit, button: 'left', clickCount: 1 });
    await guest.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...edit, button: 'left', clickCount: 1 });
    trace('UNLOAD CLICK', edit, view.getBounds(), await evaluate(guest, `({clicked:window.__clicked,active:document.activeElement?.outerHTML,handler:String(document.getElementById('edit').onclick),zoom:devicePixelRatio,viewport:innerWidth,userActivation:navigator.userActivation.hasBeenActive})`));
    assert.equal(await evaluate(guest, `typeof window.onbeforeunload`), 'function', 'user click arms unsaved changes');
    assert.equal(await evaluate(guest, `navigator.userActivation.hasBeenActive`), true);
    await Promise.race([manager.execute({ action: 'tab.close', tabId: tab.id }), delay(5000).then(() => { throw new Error('close never settled; prompts=' + unloadPrompts); })]);
    assert(unloadPrompts > 0); assert(current.tabs.some(item => item.id === tab.id), 'Stay keeps WebContents and tab'); assert(!guest.isDestroyed());
    unloadDecision = 1; await Promise.race([manager.execute({ action: 'tab.close', tabId: tab.id }), delay(5000).then(() => { throw new Error('second close never settled; prompts=' + unloadPrompts); })]);
    assert(!current.tabs.some(item => item.id === tab.id)); assert(guest.isDestroyed());
    trace('REOPEN after unload');
    await manager.execute({ action: 'tab.reopen' }); await until(() => current.tabs.some(item => item.id === current.activeTabId && !item.loading), 'reopen after confirmation');
    trace('HTTP auth');
    const restoredTab = current.tabs.find(item => item.id === current.activeTabId);
    await manager.execute({ action: 'tab.navigate', tabId: restoredTab.id, url: `${site}/protected` });
    const challenge = await until(() => current.authentication?.[0], 'HTTP authentication challenge');
    await until(() => has('Password'), 'plugin authentication form');
    await manager.execute({ action: 'auth.respond', id: challenge.id, credentials: { username: 'fixture', password: 'secret' } });
    await until(() => current.tabs.find(item => item.id === restoredTab.id && item.url.endsWith('/protected') && !item.loading && item.tools.length), 'HTTP auth completes');
    assert(!current.authentication?.length);
    assert(!JSON.stringify(current).includes('secret'), 'credentials never enter Browser state');
    const restoredGuest = webContents.getAllWebContents().find(wc => wc.getURL() === `${site}/protected`);
    const restoredView = win.contentView.children.find(view => view.webContents === restoredGuest);
    if (!process.env.DEEPDECK_BROWSER_CORE_SKIP_FULLSCREEN) {
    trace('HTML fullscreen');
    await restoredGuest.debugger.sendCommand('Runtime.evaluate', { expression: 'document.documentElement.requestFullscreen()', userGesture: true, awaitPromise: true });
    await until(() => restoredView.getBounds().y === 0 && restoredView.getBounds().width === win.getContentSize()[0], 'HTML fullscreen covers browser chrome');
    await evaluate(restoredGuest, 'document.exitFullscreen()');
    await until(() => restoredView.getBounds().y > 0, 'HTML fullscreen restores browser chrome');
    } else console.log('SKIP native HTML fullscreen: desktop session is locked.');
    trace('BLOB');
    const blobUrl = await evaluate(restoredGuest, `URL.createObjectURL(new Blob(['<title>Blob preview</title><p>Generated document</p>'], {type:'text/html'}))`);
    await manager.execute({ action: 'tab.open', url: blobUrl });
    const blob = await until(() => current.tabs.find(item => item.url === blobUrl && !item.loading && item.title === 'Blob preview'), 'generated document popup');
    assert.equal(blob.origin, site);
    await manager.execute({ action: 'tab.close', tabId: blob.id });
    await manager.execute({ action: 'tab.activate', tabId: restoredTab.id });
    // Closing/reopening the browser restores navigation entries, active tab and native zoom.
    trace('WINDOW RESTORE');
    win.close(); await until(() => !current.open, 'window close');
    manager.dispose();
    manager = createBrowserWindowManager('Browser core verification', value => { current = value; });
    await manager.execute({ action: 'open', shellUrl: host });
    await until(() => current.tabs.some(item => item.id === current.activeTabId && item.url.endsWith('/protected') && !item.loading), 'window session restore');
    const resumed = current.tabs.find(item => item.id === current.activeTabId);
    assert(resumed.canGoBack); assert(Math.abs(resumed.zoomFactor - 1.5) < .001);
    assert(current.downloads.some(item => item.id === download.id && item.state === 'completed'), 'download history survives manager restart');
    console.log('PASS Browser core (native fullscreen reported separately): real plugin UI and native page bounds, address entry, find counts/next/previous/Escape, zoom, tab order/mute, save MHTML, DevTools/WebMCP recovery, download pause/resume/cancel/open, permissions, unsaved-page Stay/Leave, HTTP auth, blob previews and window session restoration.');
    if (process.env.DEEPDECK_BROWSER_CORE_HOLD) { console.log(`Browser fixture ready for visual review: ${host}`); await delay(60000); }
  } finally {
    dialog.showMessageBoxSync = originalSync; dialog.showMessageBox = originalDialog; dialog.showSaveDialog = originalSave;
    clearTimeout(deadline); manager.dispose(); for (const server of servers) server.close(); app.quit();
  }
})().catch(error => { console.error(error); app.exit(1); });
