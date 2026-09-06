const { app, BaseWindow, webContents } = require('electron');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let attempt = 0; attempt < 100; attempt++) { const result = await read(); if (result) return result; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
const evaluate = async (contents, expression) => {
  const result = await contents.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
async function serve(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
(async () => {
  await app.whenReady();
  const site = await serve((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<title>Cited article</title><h1>Cited article</h1><p id="details">Article details</p>');
  });
  const host = await serve((request, response) => {
    if (request.url === '/client.js' || request.url === '/client.css') {
      response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(readFileSync(join(process.env.DEEPDECK_BROWSER_LINK_ASSETS, request.url.slice(1)))); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<title>Site Agent links</title><link rel="stylesheet" href="/client.css"><style>html,body{margin:0;font:16px sans-serif}#root{position:fixed;top:92px;right:0;width:420px;box-sizing:border-box;padding:20px}a{display:inline-block;padding:5px}</style><div id="root"></div><script src="/client.js"></script>');
  });
  const manager = createBrowserWindowManager('Link verification', () => {});
  try {
    const shellUrl = `${host.origin}/?site=${encodeURIComponent(site.origin)}`;
    await manager.execute({ action: 'open', shellUrl, url: site.origin });
    await manager.execute({ action: 'layout', top: 92, right: 420 });
    const original = manager.snapshot().activeTabId;
    const shell = webContents.getAllWebContents().find(contents => contents.getURL() === shellUrl);
    shell.debugger.attach('1.3');
    await until(() => evaluate(shell, "document.querySelectorAll('a').length === 5"), 'upstream Markdown links');
    const win = BaseWindow.getAllWindows()[0];
    app.focus({ steal: true }); win.focus();
    async function click(text, button = 'left') {
      shell.focus();
      await shell.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
      const point = await evaluate(shell, `(() => {
        const link = [...document.querySelectorAll('a')].find(link => link.textContent === ${JSON.stringify(text)});
        const rect = link.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, target: link.target, rel: link.rel };
      })()`);
      if (text !== 'Open same-window link') { assert.equal(point.target, '_blank'); assert.match(point.rel, /noopener/); }
      await shell.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button, clickCount: 1 });
      await shell.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button, clickCount: 1 });
    }
    const findTab = suffix => until(() => manager.snapshot().tabs.find(tab => tab.url === site.origin + suffix && !tab.loading), `linked tab ${suffix}`);
    await click('Open cited article');
    const article = await findTab('/article?source=agent#details');
    assert.equal(manager.snapshot().activeTabId, article.id);
    assert.equal(manager.snapshot().tabs[0].id, original);
    const guest = webContents.getAllWebContents().find(contents => contents.getURL() === article.url);
    assert.notEqual(guest.session, shell.session, 'website never inherits the Harness profile');
    assert.equal(await evaluate(guest, 'window.opener === null'), true, 'website cannot reach the privileged shell');
    assert.equal(await evaluate(guest, 'typeof process'), 'undefined');
    assert.equal(shell.getURL(), shellUrl);
    assert.equal(await evaluate(shell, 'document.querySelector("textarea").value'), 'Keep this unsent draft');
    console.log('PASS cited link opens a managed tab, preserves URL/query/fragment and draft, with isolated session and no opener.');

    await click('Open background article', 'middle');
    await findTab('/background');
    assert.equal(manager.snapshot().activeTabId, article.id, 'middle click leaves the active tab in place');
    shell.focus();
    await evaluate(shell, `Array.from(document.querySelectorAll('a')).find(link => link.textContent === 'Open by keyboard').focus()`);
    await shell.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await shell.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    const keyboard = await findTab('/keyboard');
    assert.equal(manager.snapshot().activeTabId, keyboard.id);
    await click('Open same-window link');
    const sameWindow = await findTab('/same-window');
    assert.equal(manager.snapshot().activeTabId, sameWindow.id);
    assert.equal(shell.getURL(), shellUrl);
    console.log('PASS keyboard, middle-click background tab and same-window link routing.');

    const count = manager.snapshot().tabs.length;
    await click('Protected Harness URL'); await delay(200);
    assert.equal(manager.snapshot().tabs.length, count);
    assert.equal(await evaluate(shell, '!!document.querySelector("a[href^=file]")'), false);
    assert.equal(BaseWindow.getAllWindows().length, 1, 'no unmanaged popup window');
    console.log('PASS Harness URLs cannot become website tabs; unsafe Markdown destinations remain inert.');
    await manager.execute({ action: 'tab.close', tabId: article.id });
  } finally { manager.dispose(); host.server.close(); site.server.close(); }
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
