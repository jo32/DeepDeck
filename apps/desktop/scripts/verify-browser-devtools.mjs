// Real Electron + official MCP + Browser Agent tools, using temporary profiles.
import { build } from 'esbuild';
import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'deepdeck-devtools-check-'));
const entry = join(temporary, 'runtime.mjs');
let child;
try {
  await symlink(join(root, 'plugins/browser/node_modules'), join(temporary, 'node_modules'), 'junction');
  await build({ entryPoints: [join(root, 'apps/desktop/src/main/windows/browser-window.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(temporary, 'native.cjs') });
  await build({ stdin: { contents: `export { BrowserRuntime } from './runtime.ts'; export { BrowserNativeClient } from './native-client.ts'; export { BrowserSiteStore } from './site-store.ts'; export { WebMCPStore } from './webmcp-store.ts'; export { WEBMCP_TEXT_EDITING_EXAMPLE } from './builder-editing-example.ts';`, resolveDir: join(root, 'plugins/browser/src'), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: entry });
  const { BrowserRuntime, BrowserNativeClient, BrowserSiteStore, WebMCPStore, WEBMCP_TEXT_EDITING_EXAMPLE } = await import(pathToFileURL(entry).href);
  const environment = { ...process.env, DEEPDECK_BROWSER_TEST_BUNDLE: join(temporary, 'native.cjs'), DEEPDECK_BROWSER_TEST_PROFILE: join(temporary, 'profile') };
  delete environment.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [fileURLToPath(new URL('./browser-devtools-fixture.cjs', import.meta.url))], { env: environment, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const exit = new Promise(resolve => child.once('exit', resolve));
  const native = new BrowserNativeClient(child);
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Electron fixture startup timed out')), 20000);
    child.on('message', message => { if (message.type === 'ready') { clearTimeout(timer); resolve(message.origin); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Electron fixture exited: ${code}`)); });
  });
  async function until(read, label) { for (let i = 0; i < 100; i++) { const value = await read(); if (value) return value; await new Promise(r => setTimeout(r, 50)); } throw new Error(`Timed out: ${label}`); }
  const first = await until(async () => (await native.request({ action: 'snapshot' })).tabs.find(tab => tab.origin === origin && !tab.loading && tab.tools.length), 'site tools');
  const sites = new BrowserSiteStore(join(temporary, 'browser'));
  const site = await sites.ensure(origin);
  const tools = new Map();
  const savedImages = [];
  const scope = { tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } }, skills: { register: () => () => {} }, systemPrompt: { section: () => () => {} } };
  const agent = { status: 'idle', session: { id: 'test-agent', header: { cwd: site.workspacePath }, events: [], append() { throw new Error('Session log must not be modified'); } }, ctx: { inject(_names, apply) { const dispose = apply(scope); return { await: async () => {}, dispose: async () => dispose() }; } } };
  const context = { agents: { get: id => id === agent.session.id ? agent : undefined, list: () => [] }, workspaceRegistry: { create: async path => ({ id: 'workspace', path, title: 'test' }) }, logger: { warn: console.error }, systemPrompt: { assemble: async () => ({}) }, on: () => () => {}, attachments: { saveImages: async images => { savedImages.push(...images); return images.map(image => ({ attachmentId: 'test-image', mediaType: image.mediaType, bytes: image.data.length, width: 1440, height: 940 })); } } };
  const runtime = new BrowserRuntime(context, native, sites, new WebMCPStore(join(temporary, 'webmcp')));
  const invoke = async (name, args = {}, signal = new AbortController().signal) => {
    assert(tools.has(name), `${name} must be registered`);
    return JSON.parse(await tools.get(name).execute(args, { agent, signal }));
  };
  const mcp = async (name, args = {}) => {
    const result = await invoke('mcp__chrome_devtools__call_tool', { name, arguments: args });
    assert(!result.isError, `${name}: ${JSON.stringify(result)}`);
    return result;
  };
  const text = result => result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
  try {
    await runtime.bind(site.id, agent.session.id, first.id, 'use');
    const catalog = await invoke('mcp__chrome_devtools__list_tools');
    assert.equal(catalog.version, '1.8.0');
    assert(catalog.tools.some(tool => tool.name === 'get_network_request'));
    assert(!catalog.tools.some(tool => ['list_webmcp_tools', 'execute_webmcp_tool'].includes(tool.name)));
    assert.match(catalog.webmcp, /browser_webmcp_call/);
    assert(!JSON.stringify(catalog).includes('wsEndpoint'));
    const pages = text(await mcp('list_pages'));
    assert.match(pages, /DevTools integration/); assert(!pages.includes('Trusted Harness'));
    const pageId = Number(pages.match(/^(\d+):/m)[1]);
    assert.match(text(await mcp('take_snapshot', { pageId })), /Read articles/);
    assert.match(text(await mcp('evaluate_script', { pageId, function: `async()=>{console.log('agent-console'); const response=await fetch('/api');return await response.json()}` })), /three/);
    assert.match(text(await mcp('list_console_messages', { pageId })), /agent-console/);
    const network = text(await mcp('list_network_requests', { pageId }));
    assert.match(network, /\/api/);
    const reqid = Number(network.match(/reqid=(\d+)/)[1]);
    assert.match(text(await mcp('get_network_request', { pageId, reqid })), /three/);
    const screenshot = await mcp('take_screenshot', { pageId });
    assert(screenshot.content.some(block => block.attachment?.attachmentId === 'test-image'));
    assert(savedImages[0].data.length > 100);
    const rendered = tools.get('mcp__chrome_devtools__call_tool').output.render({}, JSON.stringify(screenshot));
    assert(rendered.some(block => block.type === 'image'));
    await invoke('browser_set_mode', { mode: 'builder' });
    assert(tools.has('mcp__chrome_devtools__call_tool'));
    const nativeScreenshot = await invoke('browser_screenshot');
    assert.equal(nativeScreenshot.attachment.attachmentId, 'test-image');
    assert(tools.get('browser_screenshot').output.render({}, JSON.stringify(nativeScreenshot)).some(block => block.type === 'image'));

    // Execute the exact skill example through compiler -> native WebMCP -> Host
    // tools; simulate the Agent's content decision between read and write calls.
    const inspection = await invoke('browser_inspect');
    assert(inspection.content.elements.some(element => element.id === 'reply' && element.contentEditable && element.role === 'textbox' && element.label === 'Reply'));
    assert(inspection.content.elements.some(element => element.name === 'body' && element.maxLength === 2000 && !element.readOnly));
    await invoke('webmcp_write_source', { source: WEBMCP_TEXT_EDITING_EXAMPLE + `
      sdk.registerTool({name:'read_rich_reply',description:'Read rich reply and preview',inputSchema:{type:'object'},execute:()=>({
        text:document.getElementById('reply').textContent, formatted:document.querySelector('#reply strong').textContent,
        preview:document.getElementById('reply-preview').textContent
      })});
      sdk.registerTool({name:'prepare_rich_reply_edit',description:'Request native replacement of the reply text while keeping formatting; does not submit',
        inputSchema:{type:'object',properties:{text:{type:'string'},expectedValue:{type:'string'}},required:['text','expectedValue']},
        execute:({text,expectedValue})=>{
          if(document.getElementById('reply').textContent!==expectedValue) throw new Error('Reply changed');
          return {status:'requires_browser_action',target:{role:'textbox',label:'Reply'},operation:'replace_selection',
            selectedText:document.getElementById('reply-text').textContent,expectedValue,text,reason:'Editor requires trusted native input'};
        }});
    ` });
    await invoke('webmcp_apply');
    const pageTool = async (name, input = {}) => {
      const context = await invoke('browser_context');
      const tool = context.tabs.find(tab => tab.id === first.id).tools.find(tool => tool.name === `deepdeck_${name}`);
      assert(tool, `Discovered ${name}`);
      return invoke('browser_webmcp_call', { name: tool.name, frameId: tool.frameId, documentId: tool.documentId, revision: tool.revision, input });
    };
    const draft = await pageTool('read_reply_draft');
    assert.equal(draft.text, '原有草稿');
    await mcp('evaluate_script', { pageId, function: '()=>{document.getElementById("draft-controls").disabled=true}' });
    assert.equal((await pageTool('read_reply_draft')).editable, false, 'fieldset disability applies to its textarea');
    await assert.rejects(pageTool('write_reply_draft', { editorId: draft.editorId, text: 'Must not edit a disabled fieldset', expectedValue: draft.text }), /unavailable/);
    assert.equal((await pageTool('read_reply_draft')).text, draft.text);
    await mcp('evaluate_script', { pageId, function: '()=>{document.getElementById("draft-controls").disabled=false}' });
    const replacement = `${draft.text}\n补充中文、emoji 🙂 和多行内容`;
    await pageTool('write_reply_draft', { editorId: draft.editorId, text: replacement, expectedValue: draft.text });
    assert.equal((await pageTool('read_reply_draft')).text, replacement);
    await until(async () => text(await mcp('evaluate_script', { pageId, function: '()=>document.getElementById("draft-preview").textContent' })).includes('补充中文'), 'site preview accepts textarea input');
    await assert.rejects(pageTool('write_reply_draft', { editorId: draft.editorId, text: 'Must not overwrite', expectedValue: draft.text }), /changed/);
    await assert.rejects(pageTool('write_reply_draft', { editorId: draft.editorId, text: 'x'.repeat(2001), expectedValue: replacement }), /length/);
    assert.equal((await pageTool('read_reply_draft')).text, replacement);
    await mcp('evaluate_script', { pageId, function: `()=>{
      const previous=document.querySelector('textarea[name="body"]');
      const next=previous.cloneNode(true);next.value=previous.value;previous.replaceWith(next);
    }` });
    await assert.rejects(pageTool('write_reply_draft', { editorId: draft.editorId, text: 'Must not edit a replacement composer', expectedValue: replacement }), /changed/);
    const replacedDraft = await pageTool('read_reply_draft');
    assert.notEqual(replacedDraft.editorId, draft.editorId, 'same-value replacement editor has a new identity');
    assert.equal(replacedDraft.text, replacement);

    // Handoff completes before the next Browser action, including in Use mode.
    await invoke('browser_set_mode', { mode: 'use' });
    const originalReply = await pageTool('read_rich_reply');
    const handoff = await pageTool('prepare_rich_reply_edit', { text: '主 Agent 修改后的回复 🙂', expectedValue: originalReply.text });
    assert.equal(handoff.status, 'requires_browser_action');
    assert.equal((await pageTool('read_rich_reply')).text, originalReply.text, 'handoff does not mutate or wait for another Agent turn');
    assert.equal((await pageTool('read_rich_reply')).text, handoff.expectedValue);
    const freshSnapshot = text(await mcp('take_snapshot', { pageId }));
    assert.match(freshSnapshot, /textbox "Reply"/);
    // Use the observed editor interface to select only the requested text;
    // Chromium input performs the mutation, preserving the bold sibling.
    await mcp('evaluate_script', { pageId, function: `()=>{
      const editor=document.getElementById('reply');editor.focus();
      const range=document.createRange();range.selectNodeContents(document.getElementById('reply-text'));
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return selection.toString();
    }` });
    await mcp('type_text', { pageId, text: handoff.text });
    const editedReply = await pageTool('read_rich_reply');
    assert.equal(editedReply.text, `保留格式${handoff.text}`);
    assert.equal(editedReply.formatted, '保留格式');
    assert.equal(editedReply.preview, editedReply.text, 'site received trusted input');
    assert.match(text(await mcp('evaluate_script', { pageId, function: '()=>document.body.dataset.posts' })), /"0"/, 'editing never submits');
    const searchSnapshot = text(await mcp('take_snapshot', { pageId }));
    const searchUid = searchSnapshot.match(/uid=(\S+) (?:searchbox|textbox) "Search"/)[1];
    await mcp('fill', { pageId, uid: searchUid, value: '中文搜索 WebMCP' });
    await mcp('press_key', { pageId, key: 'Enter' });
    assert.match(text(await mcp('evaluate_script', { pageId, function: '()=>document.getElementById("results").textContent' })), /Results for: 中文搜索 WebMCP/);
    await invoke('browser_set_mode', { mode: 'builder' });
    console.log('PASS Builder editing: exact bundled example, Chinese/multiline round trip, inherited disabled state, editor identity, stale draft and length checks, rich-editor native-input handoff in Use mode, preserved formatting, site preview, separate search submission.');

    await invoke('webmcp_write_source', { source: `__deepdeckWebMCP.registerTool({name:'articles',description:'Read articles',inputSchema:{type:'object'},execute:async()=>await (await fetch('/api')).json()})` });
    await invoke('webmcp_apply');
    const available = JSON.stringify(await invoke('browser_context'));
    assert.match(available, /site_title/); assert.match(available, /deepdeck_articles/);
    const originalTool = (await invoke('browser_context')).tabs.find(tab => tab.id === first.id).tools.find(tool => tool.name === 'deepdeck_articles');
    const callTool = tool => invoke('browser_webmcp_call', { name: tool.name, frameId: tool.frameId, documentId: tool.documentId, revision: tool.revision, input: {} });
    assert.deepEqual(await callTool(originalTool), { articles: ['one', 'two', 'three'] });
    // A same-name replacement must never execute through a stale name-only path.
    await invoke('webmcp_write_source', { source: `__deepdeckWebMCP.registerTool({name:'articles',description:'Replacement',inputSchema:{type:'object'},execute:()=>({version:'replacement'})})` });
    await invoke('webmcp_apply');
    await assert.rejects(callTool(originalTool), /stale/);
    await assert.rejects(mcp('execute_webmcp_tool', { pageId, toolName: 'deepdeck_articles' }), /browser_webmcp_call/);
    await runtime.activate(site, originalTool.revision);

    // Fault injection: delay registration completion after the actual tool is
    // visible, so Host cancellation races an unfinished native transaction.
    await invoke('webmcp_write_source', { source: `
      const context=document.modelContext;
      const register=context.registerTool.bind(context);
      context.registerTool=(...args)=>Promise.resolve(register(...args)).then(()=>new Promise(resolve=>setTimeout(resolve,1200)));
      __deepdeckWebMCP.onDispose(()=>{context.registerTool=register});
      __deepdeckWebMCP.registerTool({name:'slow_registration',description:'Fixture',inputSchema:{type:'object'},execute:()=>123});
    ` });
    const installAbort = new AbortController();
    const runningInstall = runtime.activate(site, undefined, installAbort.signal);
    const cancelledInstall = assert.rejects(runningInstall, /canceled/);
    await until(async () => (await native.request({ action: 'snapshot' })).tabs.some(tab => tab.tools.some(tool => tool.name === 'deepdeck_slow_registration')), 'delayed registration starts');
    installAbort.abort();
    await cancelledInstall;
    await runtime.toggle(site.id, false);
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal((await runtime.describe(site)).enabled, false);
    assert(!(await native.request({ action: 'snapshot' })).tabs.find(tab => tab.id === first.id).tools.some(tool => tool.source === 'deepdeck'), 'a late install rollback must not restore disabled tools');
    await mcp('navigate_page', { pageId, type: 'reload' });
    await until(async () => (await native.request({ action: 'snapshot' })).tabs.some(tab => tab.id === first.id && !tab.loading && tab.tools.some(tool => tool.name === 'site_title')), 'disabled page reload');
    assert(!(await native.request({ action: 'snapshot' })).tabs.find(tab => tab.id === first.id).tools.some(tool => tool.source === 'deepdeck'));
    await runtime.toggle(site.id, true);
    await mcp('navigate_page', { pageId, type: 'reload' });
    const refreshed = await until(async () => {
      const context = await invoke('browser_context');
      return context.tabs.find(tab => tab.id === first.id && !tab.loading && tab.tools.some(tool => tool.name === 'deepdeck_articles'));
    }, 'saved WebMCP after DevTools navigation');
    const generated = refreshed.tools.find(tool => tool.name === 'deepdeck_articles');
    assert.deepEqual(await invoke('browser_webmcp_call', { name: generated.name, frameId: generated.frameId, documentId: generated.documentId, revision: generated.revision, input: {} }), { articles: ['one', 'two', 'three'] });
    await mcp('performance_start_trace', { pageId, reload: false, autoStop: false });
    await mcp('performance_stop_trace', { pageId });
    await invoke('browser_set_mode', { mode: 'use' });
    assert.match(text(await mcp('evaluate_script', { pageId, function: '()=>document.title' })), /DevTools integration/);
    await invoke('browser_open_tab', { url: origin + '/second' });
    const second = await until(async () => (await native.request({ action: 'snapshot' })).tabs.find(tab => tab.id !== first.id && !tab.loading), 'second tab');
    assert.match(text(await mcp('evaluate_script', { pageId, function: '()=>location.pathname' })), /"\/"/);
    await invoke('browser_select_tab', { tabId: second.id });
    const newPages = text(await mcp('list_pages'));
    const secondPageId = Number(newPages.match(/^(\d+):/m)[1]);
    assert.match(text(await mcp('evaluate_script', { pageId: secondPageId, function: '()=>location.pathname' })), /second/);
    const cancellation = new AbortController();
    const pending = invoke('mcp__chrome_devtools__call_tool', { name: 'evaluate_script', arguments: { pageId: secondPageId, function: `()=>{document.body.dataset.runs=String(Number(document.body.dataset.runs||0)+1);const p=document.createElement('p');p.textContent='mcp-started:'+document.body.dataset.runs;document.body.append(p);return new Promise(resolve=>setTimeout(()=>resolve('finished'),5000))}` } }, cancellation.signal);
    const cancelled = assert.rejects(pending);
    await until(async () => {
      const tab = (await native.request({ action: 'snapshot' })).tabs.find(tab => tab.id === second.id);
      const inspected = await native.request({ action: 'page.inspect', tabId: tab.id, documentId: tab.documentId });
      return inspected.content.text.includes('mcp-started:1');
    }, 'MCP operation actually starts before cancellation');
    cancellation.abort(); await cancelled;
    const restored = text(await mcp('list_pages'));
    const restoredId = Number(restored.match(/^(\d+):/m)[1]);
    assert.match(text(await mcp('evaluate_script', { pageId: restoredId, function: '()=>document.body.dataset.runs' })), /"1"/, 'cancelled operations must not be replayed');
    // Authenticate and reject a raw attempt to reach a different target.
    const live = (await native.request({ action: 'snapshot' })).tabs.find(tab => tab.id === second.id);
    const lease = await native.request({ action: 'devtools.open', tabId: live.id, documentId: live.documentId, workspacePath: site.workspacePath });
    const unauthorized = new WebSocket(lease.wsEndpoint, { headers: { Authorization: 'Bearer invalid' } });
    await assert.rejects(new Promise((resolve, reject) => { unauthorized.once('open', resolve); unauthorized.once('error', reject); }), /403/);
    const socket = new WebSocket(lease.wsEndpoint, { headers: { Authorization: `Bearer ${lease.token}` } });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const denied = new Promise(resolve => socket.once('message', raw => resolve(JSON.parse(raw.toString()))));
    socket.send(JSON.stringify({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'unrelated-harness-target', flatten: true } }));
    assert.match((await denied).error.message, /another Browser tab/);
    let sequence = 1;
    const rpc = (method, params = {}) => {
      const id = ++sequence;
      const result = new Promise(resolve => {
        const receive = raw => { const message = JSON.parse(raw.toString()); if (message.id === id) { socket.off('message', receive); resolve(message); } };
        socket.on('message', receive);
      });
      socket.send(JSON.stringify({ id, method, params })); return result;
    };
    // Test a root command and a flattened page session. Target ownership alone
    // cannot restrict profile-scoped CDP cookie/storage commands.
    const attached = await rpc('Target.attachToTarget', { flatten: true });
    assert(attached.result.sessionId);
    for (const [method, params] of [
      ['Network.getCookies', { urls: ['https://unrelated-review.invalid'] }], ['Network.getAllCookies', {}],
      ['Network.setCookie', { url: 'https://unrelated-review.invalid', name: 'review', value: 'denied' }],
      ['Storage.getCookies', {}], ['Storage.clearDataForOrigin', { origin: 'https://unrelated-review.invalid', storageTypes: 'all' }],
      ['WebMCP.invokeTool', { frameId: live.tools[0].frameId, toolName: live.tools[0].name, input: {} }],
    ]) {
      assert.match((await rpc(method, params)).error.message, /not available/);
      const id = ++sequence;
      const denied = new Promise(resolve => { const receive = raw => { const message = JSON.parse(raw.toString()); if (message.id === id) { socket.off('message', receive); resolve(message); } }; socket.on('message', receive); });
      socket.send(JSON.stringify({ id, method, params, sessionId: attached.result.sessionId }));
      assert.match((await denied).error.message, /not available/);
    }
    assert.match((await rpc('Page.navigate', { url: 'http://localhost:1/' })).error.message, /another site/);
    assert.equal((await rpc('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.result.value, 'DevTools integration');
    const revoked = new Promise(resolve => socket.once('close', resolve));
    await native.request({ action: 'tab.navigate', tabId: live.id, url: origin.replace('127.0.0.1', 'localhost') });
    await revoked;
    await assert.rejects(native.request({ action: 'devtools.begin', tabId: live.id, documentId: live.documentId, leaseId: lease.id }));
    console.log('PASS Browser + official MCP: both screenshot paths, one versioned WebMCP execution entry, canceled install/disable/reload consistency, console/network/performance, bound tabs, no replay, authenticated CDP target and cookie/storage restrictions, cross-site lease revocation.');
  } finally { runtime.dispose(); await new Promise(r => setTimeout(r, 250)); child.send({ type: 'shutdown' }); await exit; }
} finally {
  if (child?.exitCode === null) child.kill('SIGTERM');
  await rm(temporary, { recursive: true, force: true });
}
