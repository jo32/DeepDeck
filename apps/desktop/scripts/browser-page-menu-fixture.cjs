const { app, Menu, webContents, clipboard } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let attempt = 0; attempt < 100; attempt++) { const value = read(); if (value) return value; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
let latestMenu;
const popup = Menu.prototype.popup;
Menu.prototype.popup = function(options) { latestMenu = { menu: this, options }; return popup.call(this, options); };
const servers = [];
async function serve(html) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
    servers.push(server); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}
(async () => {
  await app.whenReady();
  const shell = await serve('<title>Page menu verification</title>');
  const site = await serve(`<style>body{padding:24px;font:18px sans-serif}textarea{display:block;margin:24px 0}</style>
    <p id="selected">Browser selection 你好</p><textarea id="edit">Editable text</textarea><a id="link" href="/other">A link</a>`);
  let current;
  const manager = createBrowserWindowManager('Page menu verification', value => { current = value; });
  const savedClipboard = clipboard.availableFormats().map(format => [format, clipboard.readBuffer(format)]);
  let testClipboard;
  try {
    await manager.execute({ action: 'open', shellUrl: shell });
    await manager.execute({ action: 'tab.navigate', tabId: current.activeTabId, url: site });
    const tab = await until(() => current.tabs.find(tab => tab.origin === site && !tab.loading), 'local website');
    const wc = webContents.getAllWebContents().find(wc => wc.getURL().startsWith(site));
    let params;
    wc.on('context-menu', (_event, value) => { params = value; });
    const evaluate = async expression => { const result = await wc.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true }); assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const rightClick = async (id, select) => {
      latestMenu = undefined; params = undefined;
      wc.focus();
      await wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
      const point = await evaluate(`(() => { const e=document.getElementById(${JSON.stringify(id)}); ${select ? `const range=document.createRange();range.selectNodeContents(e);window.getSelection().removeAllRanges();window.getSelection().addRange(range);` : 'window.getSelection().removeAllRanges(); e.focus();'} const r=e.getBoundingClientRect();return {x:r.left+8,y:r.top+8}; })()`);
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'right', buttons: 2, clickCount: 1 });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'right', buttons: 0, clickCount: 1 });
      await until(() => latestMenu && params, 'native right-click menu');
      assert(latestMenu.menu.items.length > 0);
      return latestMenu;
    };
    const choose = (popup, label) => {
      const item = popup.menu.items.find(item => item.label === label);
      assert(item?.enabled, `Menu item enabled: ${label}`);
      popup.menu.closePopup(popup.options.window);
      item.click(item, popup.options.window, {});
    };
    let menu = await rightClick('selected', true);
    assert.equal(params.selectionText, 'Browser selection 你好');
    choose(menu, 'Copy');
    await until(() => clipboard.readText() === params.selectionText, 'copy selected text');
    testClipboard = params.selectionText;
    menu = await rightClick('selected', true);
    choose(menu, 'Add to Site Agent');
    const selection = await until(() => current.selections?.[0], 'Agent selection request');
    assert.equal(selection.text, 'Browser selection 你好');
    assert.equal(selection.tabId, tab.id);
    assert.equal(selection.documentId, tab.documentId);
    assert.equal(new URL(selection.url).origin, site);
    await manager.execute({ action: 'page.selection.ack', id: selection.id });
    assert.equal(current.selections, undefined);
    menu = await rightClick('edit', false);
    assert(menu.menu.items.some(item => item.label === 'Paste' && item.enabled));
    choose(menu, 'Select all');
    menu = await rightClick('link', false);
    choose(menu, 'Open link in new tab');
    await until(() => current.tabs.some(next => next.url === site + '/other' && !next.loading), 'open link in new tab');
    await manager.execute({ action: 'tab.activate', tabId: tab.id });
    await manager.execute({ action: 'zoom', tabId: tab.id, factor: 1.5 });
    menu = await rightClick('selected', true);
    assert.equal(menu.options.y, 92 + Math.round(params.y * wc.getZoomFactor()));
    const stale = menu.menu.items.find(item => item.label === 'Add to Site Agent');
    menu.menu.closePopup(menu.options.window);
    await manager.execute({ action: 'tab.navigate', tabId: tab.id, url: site + '/changed' });
    await until(() => current.tabs.find(next => next.id === tab.id && next.documentId !== tab.documentId), 'navigation invalidation');
    stale.click(stale, menu.options.window, {});
    assert.equal(current.selections, undefined, 'old menu cannot attach content after navigation');
    console.log('PASS Browser page context menus: real text selection/right-click, copy, Agent excerpt + acknowledgement, editable actions, new-tab links, zoom anchoring and stale-document rejection.');
  } finally {
    latestMenu?.menu.closePopup(latestMenu.options.window);
    if (clipboard.readText() === testClipboard) { clipboard.clear(); for (const [format, buffer] of savedClipboard) clipboard.writeBuffer(format, buffer); }
    manager.dispose(); for (const server of servers) server.close(); app.quit();
  }
})().catch(error => { console.error(error); app.exit(1); });
