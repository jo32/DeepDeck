const { app, webContents } = require('electron');
const http = require('node:http');
const { readFileSync, writeFileSync, mkdirSync, realpathSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => { console.error('WebMCP market fixture timed out'); app.exit(1); }, 90000);
const servers = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function serve(handler) { return new Promise(resolve => { const server = http.createServer(handler); servers.push(server); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); }); }
async function until(read, label) { for (let i = 0; i < 120; i++) { const value = await read(); if (value) return value; await delay(50); } throw new Error(`Timed out: ${label}`); }
(async () => {
  await app.whenReady();
  const origin = await serve((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<title>Community fixture</title><h1>Articles</h1>'); });
  const toolNames = ['community_read', 'deepdeck_list_forum_directory', 'deepdeck_list_home_featured_topics', 'deepdeck_list_forum_topics', 'deepdeck_read_topic_page', 'deepdeck_nga_auth_status', 'deepdeck_open_native_login_dialog', 'deepdeck_inspect_current_account'];
  const source = toolNames.map(name => `globalThis.__deepdeckWebMCP.registerTool({name:${JSON.stringify(name)},description:"Read the title",inputSchema:{type:"object"},execute:()=>({title:document.title})});`).join('\n');
  const revision = 'a'.repeat(64); const sourceDigest = createHash('sha256').update(source).digest('hex');
  const provenance = { repositoryId: 1, repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', commit: 'b'.repeat(40), version: '1.0.0', release: 'v1.0.0', sourceSha256: sourceDigest,
    author: { login: 'test', url: 'https://github.com/test', avatarUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24"%3E%3Crect width="24" height="24" rx="12" fill="%23718091"/%3E%3C/svg%3E' } };
  const { listDraftFiles, listWorkspaceFiles, readDraftFile } = require(join(process.env.DEEPDECK_BROWSER_CORE_ASSETS, 'publication-files.cjs'));
  const workspace = join(realpathSync(process.env.DEEPDECK_BROWSER_CORE_ASSETS), 'workspace');
  mkdirSync(workspace);
  const sidebarRoutes = []; const sidebarDisposers = [];
  const sidebar = await import(pathToFileURL(process.env.DEEPDECK_SIDEBAR_HOST).href);
  sidebar.apply({
    on: () => () => {},
    sessions: { get: () => ({ header: { cwd: workspace } }) },
    get: () => undefined, webRuntime: { trustedHosts: [] },
    logger: { warn: console.warn }, inject: () => {},
    webServer: { register: route => { sidebarRoutes.push(route); return () => {} }, registerUpgrade: () => () => {} },
    effect: setup => { sidebarDisposers.push(setup()); },
  });
  let project = null;
  let manager; let installed = false; let installCalls = 0; let catalogCalls = 0;
  const site = () => ({ id: 'fixture', origin, title: 'Community fixture', workspacePath: workspace, workspaceId: 'fixture', sessionId: 'fixture-session', mode: 'use', enabled: installed, revisions: installed ? [revision] : [], ...(installed ? { activeRevision: revision, provenance } : {}) });
  const host = await serve(async (req, res) => {
    const route = sidebarRoutes.find(route => route.kind === 'prefix' ? req.url.startsWith(route.path) : req.url === route.path);
    if (route) return route.handler(req, res);
    if (req.url === '/api' || req.url === '/api/deepdeck/browser') {
      let body = ''; for await (const chunk of req) body += chunk;
      try {
        const input = JSON.parse(body); let result;
        if (input.action === 'state') result = { available: true, native: manager.snapshot(), sites: [site()] };
        else if (input.action === 'open') result = await manager.execute({ action: 'open', shellUrl: host, url: input.url });
        else if (input.action === 'command') result = await manager.execute(input.command);
        else if (input.action === 'project.state') result = project;
        else if (input.action === 'project.start') {
          const directory = join(workspace, 'webmcp-project');
          mkdirSync(join(directory, 'src'), { recursive: true });
          mkdirSync(join(directory, '.agents/skills/read-articles'), { recursive: true });
          writeFileSync(join(directory, 'src/webmcp.ts'), source);
          writeFileSync(join(directory, 'webmcp.json'), JSON.stringify({ name: 'Community articles', entry: 'src/webmcp.ts' }));
          writeFileSync(join(directory, 'LICENSE'), 'MIT fixture license');
          writeFileSync(join(directory, '.agents/skills/read-articles/SKILL.md'), '# Read articles skill');
          project = { directory, sourcePath: join(directory, 'src/webmcp.ts'), upstream: provenance, sourceDigest, changed: false, merging: false, conflicts: [] };
          result = project;
        } else if (input.action === 'project.preview') result = { token: 'merge-preview', upstream: { ...provenance, commit: 'c'.repeat(40) }, diff: '<<<<<<< Local\nlocal change\n=======\nupstream change\n>>>>>>> Upstream', conflicts: ['src/webmcp.ts'] };
        else if (input.action === 'project.cancel') result = {};
        else if (input.action === 'project.merge') { project = { ...project, merging: true, conflicts: ['src/webmcp.ts'] }; result = project; }
        else if (input.action === 'project.abort') { project = { ...project, merging: false, conflicts: [] }; result = project; }
        else if (input.action === 'market.catalog') result = { formatVersion: 1, generatedAt: null, entries: ++catalogCalls === 1 ? [] : [{ id: 'fixture', ...provenance, name: 'Community articles', description: 'Read the current page', origin, status: 'active', tags: [] }] };
        else if (input.action === 'market.preview') result = { token: 'fixture-preview', manifest: { name: 'Community articles', description: 'Read the current page', origin, version: '1.0.0', license: 'MIT', tools: [] }, source, provenance, hasDraft: true, expiresAt: new Date(Date.now() + 60000).toISOString(), ...(installed ? { previousRevision: revision } : {}) };
        else if (input.action === 'market.install') {
          assert.equal(input.token, 'fixture-preview'); installCalls++;
          if (installCalls === 1) throw new Error('Fixture registration failure. Original tools preserved.');
          const receipt = await manager.execute({ action: 'webmcp.install', script: { origin, source, revision, sourceDigest, compiledDigest: sourceDigest } });
          assert(receipt.registered > 0); installed = true; result = site();
        } else if (input.action === 'market.export') {
          assert.equal(input.revision, revision);
          if (project) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ directory: project.directory })); return; }
          const directory = join(workspace, 'webmcp-publish-fixture');
          mkdirSync(join(directory, '.agents/skills/read-articles'), { recursive: true }); mkdirSync(join(directory, 'src'), { recursive: true });
          writeFileSync(join(directory, 'webmcp.json'), JSON.stringify({ name: 'Community articles', entry: 'src/webmcp.ts' }, null, 2));
          writeFileSync(join(directory, 'src/webmcp.ts'), source);
          writeFileSync(join(directory, '.agents/skills/read-articles/SKILL.md'), '# Read articles skill\nRead articles on the current site.');
          result = { directory };
        } else if (input.action === 'market.files.list') result = await listDraftFiles(workspace, input.draft, input.path);
        else if (input.action === 'market.files.read') result = await readDraftFile(workspace, input.draft, input.path);
        else if (input.action === 'site.webmcp.files') result = await listDraftFiles(workspace, project ? 'webmcp-project' : undefined);
        else if (input.action === 'site.files.list') result = await listWorkspaceFiles(workspace);
        else result = site();
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
    } else if (req.url === '/client.js' || req.url === '/client.css') { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(readFileSync(join(process.env.DEEPDECK_BROWSER_CORE_ASSETS, req.url.slice(1)))); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<title>DeepDeck market verification</title><link rel="stylesheet" href="/client.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/client.js"></script>'); }
  });
  manager = createBrowserWindowManager('WebMCP market verification', () => {});
  try {
    await manager.execute({ action: 'open', shellUrl: host }); await manager.execute({ action: 'tab.open', url: origin });
    const wc = webContents.getAllWebContents().find(wc => wc.getURL().startsWith(host)); wc.debugger.attach('1.3');
    const evaluate = async expression => { const value = await wc.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert(!value.exceptionDetails, JSON.stringify(value.exceptionDetails)); return value.result.value; };
    wc.on('console-message', (_event, ...args) => console.log('CLIENT', ...args));
    const content = () => evaluate('document.body.innerText');
    const click = async (text, scope) => {
      const expression = `Array.from(${scope ? `document.querySelector(${JSON.stringify(scope)})` : 'document'}.querySelectorAll('button,summary,[role=button],[role=treeitem]')).find(e=>e.textContent.trim()===${JSON.stringify(text)} || e.getAttribute('aria-label')===${JSON.stringify(text)} || e.getAttribute('title')?.endsWith('/'+${JSON.stringify(text)}) || (e.getAttribute('role') === 'button' && e.textContent.trim().startsWith(${JSON.stringify(text)})))`;
      await until(() => evaluate(`!!(${expression})`), text);
      await delay(250);
      await evaluate(`(${expression}).scrollIntoView({block:'center'})`);
      await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
      const point = await evaluate(`(()=>{const e=${expression}; const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
      assert(point.w >= 24 && point.h >= 24, `Hit area: ${text}`);
      if (await evaluate(`(${expression}).getAttribute('role') === 'button'`)) {
        await evaluate(`(${expression}).focus()`);
        await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      } else {
        for (const type of ['mousePressed', 'mouseReleased']) await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
      }
    };
    await until(async () => (await content()).includes('Community fixture'), 'site');
    await click('Open files in sidebar');
    await until(() => evaluate(`!!document.querySelector('[data-deepdeck-workspace-files]')`), 'empty workspace explorer');
    assert(await evaluate(`!!document.querySelector('[data-deepdeck-browser] header')`), 'empty files preserve Browser chrome');
    assert(!(await content()).includes('Export a draft to browse'), 'workspace does not require an export');
    writeFileSync(join(workspace, 'research.md'), '# Existing site report');
    await click('Refresh files'); await click('research.md');
    await until(async () => (await content()).includes('Existing site report'), 'workspace report preview before exporting');
    await click('Close files sidebar');
    await delay(600); await click('WebMCP');
    await until(async () => (await content()).includes('No projects listed'), 'empty directory');
    await click('Refresh'); await until(async () => (await content()).includes('Community articles'), 'populated directory');
    await click('Preview from GitHub'); await until(async () => (await content()).includes('Install on this site'), 'preview');
    assert.equal(installCalls, 0);
    await click('Review source'); await until(async () => (await content()).includes('community_read'), 'source expanded');
    await click('Review source'); await click('Install on this site');
    await until(async () => (await content()).includes('Fixture registration failure'), 'failure shown'); assert.equal(installed, false);
    await click('Preview from GitHub'); await until(async () => (await content()).includes('Install on this site'), 'retry preview');
    await click('Install on this site'); await until(async () => (await content()).includes('Registered and activated'), 'activated');
    const snapshot = manager.snapshot(); const tab = snapshot.tabs.find(tab => tab.origin === origin); const tool = tab.tools.find(tool => tool.name.includes('community_read'));
    assert(tool, 'Generated tool actually registered in native page');
    await until(() => evaluate(`!!document.querySelector('[data-imported="true"]')`), 'imported project tool list');
    assert(!(await content()).includes('Built with DeepDeck'), 'imported tools are attributed to their repository');
    assert(await evaluate(`document.querySelector('[data-imported="true"]').previousElementSibling.textContent.includes('@test')`), 'author is inside the project header');
    assert(await evaluate(`document.querySelector('[data-imported="true"]').previousElementSibling.textContent.includes('v1.0.0')`), 'stable release is shown');
    await click(tool.name);
    assert(await evaluate(`document.querySelector('[data-imported="true"] details').open`), 'tool row expands');
    await click(tool.name);
    assert.equal(await evaluate(`document.querySelector('[data-imported="true"] details').open`), false, 'tool row collapses');
    delete provenance.release;
    await until(() => evaluate(`document.querySelector('[data-imported="true"]').previousElementSibling.textContent.includes('Development preview')`), 'unreleased project is labeled as a preview');
    const toolLayout = await evaluate(`(()=>{const list=document.querySelector('[data-imported="true"]');const panel=list.closest('aside');const rows=[...list.querySelectorAll('summary')];return {count:rows.length,fits:panel.scrollWidth<=panel.clientWidth+1,compact:rows.every(row=>row.getBoundingClientRect().height>=40&&row.getBoundingClientRect().height<=48)}})()`);
    assert.equal(toolLayout.count, 8); assert(toolLayout.fits && toolLayout.compact, 'eight compact tools fit the panel');
    await evaluate(`document.querySelector('[data-imported="true"]').closest('aside').querySelector('[class*="panelScroll"]').scrollTop=0`);
    const panelClip = await evaluate(`(()=>{const r=document.querySelector('[data-imported="true"]').closest('aside').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
    const toolsImage = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png', clip: panelClip });
    writeFileSync('/tmp/deepdeck-imported-webmcp.png', Buffer.from(toolsImage.data, 'base64'));
    await evaluate(`document.querySelector('[aria-label="Resize Agent panel"]').focus()`);
    for (let step = 0; step < 8; step++) {
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    }
    await until(() => evaluate(`document.querySelector('[aria-label="Resize Agent panel"]').getAttribute('aria-valuenow')==='340'`), 'narrow tools panel');
    assert(await evaluate(`(()=>{const list=document.querySelector('[data-imported="true"]');const panel=list.closest('aside');return panel.scrollWidth<=panel.clientWidth+1&&list.previousElementSibling.scrollWidth<=list.previousElementSibling.clientWidth+1})()`), 'project details and long tool names fit at minimum width');
    await click(tool.name); await click(tool.name);
    for (let step = 0; step < 4; step++) {
      await evaluate(`document.querySelector('[aria-label="Resize Agent panel"]').focus()`);
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    }
    await click('Export GitHub draft');
    await until(() => evaluate(`document.querySelector('[data-deepdeck-workspace-files]')?.innerText.includes('globalThis.__deepdeckWebMCP')`), 'export automatically previews its source');
    await until(async () => (await content()).includes('webmcp.json'), 'exported draft root');
    assert(!(await evaluate(`document.querySelector('[data-deepdeck-workspace-files]').innerText`)).includes('research.md'), 'export opens its exact draft');
    await click('Continue in Builder');
    await until(() => evaluate(`!!document.querySelector('textarea[aria-label="Fixture chat"]')`), 'Builder continuation with files');
    assert(project, 'fixed project created');
    await click('WebMCP');
    await click('Check upstream updates');
    await until(async () => (await content()).includes('<<<<<<< Local'), 'merge preview with conflict diff');
    assert.equal(project.merging, false, 'preview does not change project');
    await click('Cancel');
    await click('Check upstream updates');
    await click('Merge into project');
    await until(async () => (await content()).includes('Abort merge'), 'conflict recovery controls');
    assert.equal(project.merging, true);
    assert.equal(installCalls, 2, 'merge does not install or change active tools');
    assert(!await evaluate(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Contribute upstream')`), 'publication blocked during unresolved merge');
    const mergeImage = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
    writeFileSync('/tmp/deepdeck-community-merge.png', Buffer.from(mergeImage.data, 'base64'));
    await click('Abort merge');
    await click('Contribute upstream');
    await until(() => evaluate(`!!window.fixturePublication`), 'publication handed to site Agent');
    const publication = await evaluate('window.fixturePublication');
    assert.equal(publication.sessionId, 'fixture-session');
    assert.equal(publication.directory, join(workspace, 'webmcp-project'));
    assert.equal(publication.intent, 'contribute');
    await until(() => evaluate(`!!document.querySelector('textarea[aria-label="Fixture chat"]')`), 'chat beside project');
    const sourceImage = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
    writeFileSync('/tmp/deepdeck-webmcp-project.png', Buffer.from(sourceImage.data, 'base64'));
    await click('src'); await click('webmcp.ts');
    await until(async () => (await content()).includes('globalThis.__deepdeckWebMCP'), 'source preview');
    await click('.agents'); await click('skills'); await click('read-articles'); await click('SKILL.md');
    await until(async () => (await content()).includes('Read articles skill'), 'skill preview');
    writeFileSync(join(workspace, 'webmcp-project/.agents/skills/read-articles/SKILL.md'), '# Refreshed skill');
    await evaluate(`document.querySelector('[data-deepdeck-workspace-files] button[aria-label="Refresh"]').click()`); await until(async () => (await content()).includes('Refreshed skill'), 'refreshed preview');
    await click('.agents'); await until(() => evaluate(`!document.querySelector('[role=button][title$="/SKILL.md"]')`), 'folder collapsed');
    await click('.agents'); await until(() => evaluate(`!!document.querySelector('[role=button][title$="/SKILL.md"]')`), 'folder expanded');
    assert.equal(await evaluate(`document.querySelector('aside[aria-label="Files"]')?.hidden`), false, 'export opens independent Files column');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Community WebMCP"] [data-deepdeck-workspace-files]')`), null, 'files are not inline');
    const fits = await evaluate(`(()=>{const e=document.querySelector('[data-deepdeck-workspace-files]');const panel=e.closest('aside');const r=e.getBoundingClientRect();return e.scrollWidth <= e.clientWidth+1 && panel.scrollHeight <= panel.clientHeight+1 && r.bottom <= innerHeight})()`); assert(fits, 'Explorer has no horizontal overflow');
    const columns = await evaluate(`(()=>{const files=document.querySelector('aside[aria-label="Files"]').getBoundingClientRect();const chat=document.querySelector('textarea[aria-label="Fixture chat"]').closest('aside').getBoundingClientRect();return {separate:chat.right<=files.left+1,chatWidth:chat.width,filesWidth:files.width}})()`);
    assert(columns.separate && columns.chatWidth >= 280 && columns.filesWidth >= 280, 'chat and files have independent columns');
    const widthBefore = columns.filesWidth;
    await evaluate(`document.querySelector('[role=separator][aria-label="Resize files sidebar"]').focus()`);
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await until(() => evaluate(`document.querySelector('aside[aria-label="Files"]').getBoundingClientRect().width > ${widthBefore}`), 'resize files independently');
    const image = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }); writeFileSync('/tmp/deepdeck-webmcp-market.png', Buffer.from(image.data, 'base64'));
    assert.equal(await evaluate('document.querySelectorAll("[data-deepdeck-workspace-files] iframe").length'), 0);
    const target = `${origin}/native-sidebar`;
    await evaluate(`window.fixtureSidebar.openTab({type:'browser',url:${JSON.stringify(target)}})`);
    await until(() => manager.snapshot().tabs.some(tab => tab.url === target), 'sidebar opens URL in native browser');
    await click('Close files sidebar');
    await until(() => evaluate(`!!document.querySelector('textarea[aria-label="Fixture chat"]')`), 'closing files preserves chat after new tab reconnect');
    await click('Open files in sidebar');
    await until(() => evaluate(`document.querySelector('aside[aria-label="Files"]')?.hidden === false`), 'reopen files independently');
    await click('Hide Agent'); await until(() => evaluate(`!document.querySelector('[aria-label="Community WebMCP"]')`), 'panel collapsed');
    console.log('PASS WebMCP market: real BrowserFrame in Electron, empty/populated directory, source disclosure, preview does not install, failure/retry, native registration, automatic discovery, independent resizable Files column alongside chat, persistent project continuation, conflict preview/cancel/merge/abort without activation, upstream contribution intent, export tree, nested skills/source preview, refresh, collapse, button hit areas and sidebar URL opening in the native Browser.');
  } finally { manager.dispose(); for (const dispose of sidebarDisposers) if (typeof dispose === 'function') dispose(); for (const server of servers) server.close(); clearTimeout(deadline); app.quit(); }
})().catch(error => { console.error(error); app.exit(1); });
