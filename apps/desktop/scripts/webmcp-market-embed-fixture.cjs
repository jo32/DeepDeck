const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
app.on('window-all-closed', () => {});
const servers = [];
const deadline = setTimeout(() => app.exit(1), 90000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function serve(handler) { return new Promise(resolve => { const server = http.createServer(handler); servers.push(server); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); }); }
async function until(read, name) { for (let i = 0; i < 160; i++) { const value = await read(); if (value) return value; await delay(50); } throw Error(`Timed out: ${name}`); }
const asset = (req, res) => {
  if (!['/client.js', '/client.css'].includes(req.url)) return false;
  res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.end(readFileSync(join(process.env.DEEPDECK_BROWSER_CORE_ASSETS, req.url.slice(1)))); return true;
};
const html = data => `<title>DeepDeck WebMCP market</title><link rel="stylesheet" href="/client.css"><style>*{box-sizing:border-box}:root{--dsw-alias-bg-layer-2:#fff;--dsw-alias-bg-mask-1:#0003}html,body{height:100%;margin:0;font-family:Arial,sans-serif}a{color:inherit;text-decoration:none}button,input,select{font:inherit}</style><div id="root"></div><script>window.marketFixture=${JSON.stringify(data)}</script><script src="/client.js"></script>`;
(async () => {
  await app.whenReady();
  const target = await serve((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<title>Native target</title><h1>Articles</h1>'); });
  const source = 'globalThis.__deepdeckWebMCP.registerTool({name:"market_read",description:"Read the title",inputSchema:{type:"object"},execute:()=>({title:document.title})});';
  const digest = createHash('sha256').update(source).digest('hex'); const revision = 'a'.repeat(64);
  const provenance = { repositoryId: 1, repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', commit: 'b'.repeat(40), version: '1.0.0', sourceSha256: digest, author: { login: 'test', url: 'https://github.com/test', avatarUrl: 'https://github.com/test.png?size=80' } };
  // Discovery metadata may be stale. Installation displays the authoritative source origin.
  const catalog = { formatVersion: 1, generatedAt: null, entries: [{ ...provenance, id: 'articles', name: 'Article tools', description: 'Read and search articles with shared WebMCP tools.', origin: 'https://example.com', tags: ['reading'], status: 'active' }] };
  let populated = false;
  const market = await serve((req, res) => { if (asset(req, res)) return; res.setHeader('Content-Type', 'text/html'); res.end(html({ kind: 'directory', catalog: populated ? catalog : { ...catalog, entries: [] } })); });
  let manager; let calls = 0; let previews = 0; let installed = false;
  const host = await serve(async (req, res) => {
    if (asset(req, res)) return;
    if (req.url === '/api/deepdeck/browser') {
      let body = ''; for await (const chunk of req) body += chunk;
      try {
        const input = JSON.parse(body); let result;
        const site = { id: 'fixture', origin: target };
        if (input.action === 'market.directory') { result = { catalog: populated ? catalog : { ...catalog, entries: [] }, source: 'bundled' }; }
        else if (input.action === 'market.prepare') {
          previews++; assert.equal(input.repository, provenance.repository);
          result = { site, preview: { token: `preview-${previews}`, source, provenance, manifest: { name: 'Article tools', description: 'Read articles', origin: target, version: '1.0.0', license: 'MIT', tools: [{ name: 'market_read', description: 'Read the title' }] }, hasDraft: true } };
        } else if (input.action === 'market.install') {
          calls++; assert.equal(input.openSite, true); assert.equal(input.token, `preview-${previews}`);
          if (calls === 1) throw Error('Fixture registration failure; previous tools preserved.');
          await manager.execute({ action: 'open', shellUrl: host + '/browser', url: target });
          await until(() => manager.snapshot().tabs.find(tab => tab.origin === target && !tab.loading), 'target ready');
          const receipt = await manager.execute({ action: 'webmcp.install', script: { origin: target, source, revision, sourceDigest: digest, compiledDigest: digest } });
          assert(receipt.registered > 0); installed = true; result = site;
        } else result = {};
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
    } else { res.setHeader('Content-Type', 'text/html'); res.end(req.url === '/browser' ? '<title>Native Browser shell fixture</title>' : html({ kind: req.url === '/local' ? 'local' : 'host', marketUrl: market + '/webmcp' })); }
  });
  manager = createBrowserWindowManager('Market native verification', () => {});
  const window = new BrowserWindow({ width: 1280, height: 950, show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadURL(host + '/local'); const wc = window.webContents; wc.debugger.attach('1.3');
    const evaluate = async (expression, contextId) => { if (contextId === 'market') contextId = await frameWorld(); const result = await wc.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId ? { contextId } : {}) }); assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const frameWorld = async () => { const tree = await wc.debugger.sendCommand('Page.getFrameTree'); const frame = tree.frameTree.childFrames?.find(row => row.frame.url.startsWith(market)); if (!frame) return; return (await wc.debugger.sendCommand('Page.createIsolatedWorld', { frameId: frame.frame.id, worldName: 'fixture' })).executionContextId; };
    await until(async () => (await evaluate('document.body.innerText')).includes('The first project'), 'bundled empty directory');
    assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0);
    assert((await evaluate('document.body.innerText')).includes('Showing the bundled directory'));
    const assertLayout = async () => {
      const bounds = await evaluate(`(()=>{const panel=document.querySelector('[role="dialog"]');const market=document.querySelector('section[aria-label="WebMCP market"]');const options=market.parentElement;const a=market.getBoundingClientRect(),b=options.getBoundingClientRect();return {marketBottom:a.bottom,optionsBottom:b.bottom,scroll:options.scrollHeight-options.clientHeight,horizontal:options.scrollWidth-options.clientWidth}})()`);
      assert(bounds.marketBottom <= bounds.optionsBottom + 1, JSON.stringify(bounds));
      assert(bounds.scroll <= 1 && bounds.horizontal <= 1, JSON.stringify(bounds));
    };
    await assertLayout(); window.setSize(1000, 700); await delay(150); await assertLayout();
    assert(await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('a')).find(e=>e.textContent.includes('Publish your WebMCP'));return button.getBoundingClientRect().bottom < document.querySelector('[role="dialog"]').getBoundingClientRect().bottom})()`), 'Empty-state publish button fits');
    const fitShot = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }); writeFileSync('/tmp/deepdeck-webmcp-settings-fit.png', Buffer.from(fitShot.data, 'base64'));
    populated = true; await clickLocalReload();
    async function clickLocalReload() { await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent==="Reload").click()'); }
    await until(async () => (await evaluate('document.body.innerText')).includes('Article tools'), 'bundled populated directory');
    await assertLayout();
    await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent==="Install").click()');
    await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'local directory preview');
    assert.equal(calls, 0);
    await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent==="Cancel").click()');
    populated = false; window.setSize(1280, 950); await window.loadURL(host);
    await until(frameWorld, 'market frame'); const world = 'market';
    await until(async () => (await evaluate('document.body.innerText', world)).includes('The first project'), 'empty market');
    await until(async () => !(await evaluate('document.body.innerText')).includes('Connecting to the market'), 'bridge connected');
    populated = true; await evaluate('document.querySelector("iframe").src += "&fixture=populated"');
    await until(async () => { const tree = await wc.debugger.sendCommand('Page.getFrameTree'); return tree.frameTree.childFrames?.some(row => row.frame.url.includes('fixture=populated')); }, 'populated frame');
    await until(async () => (await evaluate('document.body.innerText', world)).includes('Article tools'), 'populated market');
    await until(async () => await evaluate('Array.from(document.querySelectorAll("button")).some(e=>e.textContent==="Install")', world), 'embedded install action');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("nav")).display', world), 'none');
    const click = async (text, contextId) => {
      const expression = `Array.from(document.querySelectorAll('button,summary')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
      const point = await evaluate(`(()=>{const e=${expression}; if(!e)throw Error('Missing ${text}'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`, contextId);
      assert(point.w >= 24 && point.h >= 24, `Hit area ${text}`);
      if (contextId) { const offset = await evaluate('(()=>{const r=document.querySelector("iframe").getBoundingClientRect();return {x:r.x+1,y:r.y+1}})()'); point.x += offset.x; point.y += offset.y; }
      window.focus();
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    };
    await click('Install', world); await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'preview dialog');
    assert.equal(calls, 0); assert((await evaluate('document.body.innerText')).includes('@test'));
    await click('Review source'); await click('Review source');
    await click('Install on this site'); await until(async () => (await evaluate('document.body.innerText')).includes('Fixture registration failure'), 'failed install');
    assert.equal(installed, false);
    await click('Preview from GitHub'); await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'fresh preview');
    await click('Install on this site'); await until(async () => (await evaluate('document.body.innerText')).includes('Installed and activated'), 'success');
    assert(manager.snapshot().tabs.some(tab => tab.tools.some(tool => tool.name.includes('market_read'))));
    window.focus(); const shot = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }); writeFileSync('/tmp/deepdeck-webmcp-embedded-market.png', Buffer.from(shot.data, 'base64'));
    // The same page outside DeepDeck exposes a protocol link and manual fallback.
    await window.loadURL(market + '/webmcp');
    await until(() => evaluate('Array.from(document.querySelectorAll("a")).some(e=>e.href.startsWith("deepdeck://webmcp/install"))'), 'external install link');
    assert.notEqual(await evaluate('getComputedStyle(document.querySelector("nav")).display'), 'none');
    console.log('PASS settings market: container sizing, bundled fallback, local installation preview, empty/populated, handshake, native dialog, author, source disclosure, failure/retry, real native registration, standalone protocol link.');
  } finally { window.destroy(); manager.dispose(); servers.forEach(server => server.close()); clearTimeout(deadline); app.quit(); }
})().catch(error => { console.error(error); app.exit(1); });
