const { app } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
let timedOut = false;
const deadline = setTimeout(() => { timedOut = true; console.error('Lifecycle fixture timed out (requires an unlocked desktop)'); app.exit(1); }, 45000);
deadline.unref();
let holdNext = false;
let held;
app.on('web-contents-created', (_event, contents) => {
  const send = contents.debugger.sendCommand.bind(contents.debugger);
  contents.debugger.sendCommand = (method, ...args) => {
    if (holdNext && method === 'WebMCP.enable') {
      holdNext = false;
      return new Promise((resolve, reject) => {
        held = { contents, resolve };
        // A pending protocol request rejects while Chromium tears down its frame.
        contents.debugger.once('detach', () => reject(new Error('Target closed')));
      });
    }
    return send(method, ...args);
  };
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read) {
  for (let i = 0; i < 200; i++) { if (read()) return; await delay(10); }
  throw new Error('Timed out waiting for pending protocol initialization');
}
(async () => {
  await app.whenReady();
  if (timedOut) return;
  const server = http.createServer((_request, response) => response.end('<title>Lifecycle fixture</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const manager = createBrowserWindowManager('Browser lifecycle verification', () => {});
  try {
    await manager.execute({ action: 'open', shellUrl: origin });
    holdNext = true;
    const opening = manager.execute({ action: 'tab.open', url: 'https://example.test/closed-during-initialization' });
    const result = opening.then(() => 'resolved', error => error.message);
    await until(() => held);
    held.contents.close();
    assert.match(await result, /Browser tab is closed/);
    await delay(100);
    assert(!manager.snapshot().tabs.some(tab => tab.url.includes('closed-during-initialization')));
    console.log('PASS: closing a tab during protocol initialization does not navigate a dying WebContents.');
  } finally {
    clearTimeout(deadline);
    manager.dispose();
    server.close();
    app.quit();
  }
})().catch(error => { console.error(error); app.exit(1); });
