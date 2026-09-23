// Real Electron/native identity checks; no model API or user profile is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import electron from 'electron';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'deepdeck-webmcp-references-'));
let child, native, runtime, exited;
try {
  await mkdir(join(temporary, 'lib'));
  await symlink(join(root, 'plugins/browser/skills'), join(temporary, 'skills'), 'junction');
  await symlink(join(root, 'plugins/browser/node_modules'), join(temporary, 'node_modules'), 'junction');
  await build({ entryPoints: [join(root, 'apps/desktop/src/main/windows/browser-window.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(temporary, 'native.cjs'), define: { 'import.meta.dirname': JSON.stringify(join(temporary, 'main/windows')) } });
  await build({ entryPoints: [join(root, 'apps/desktop/src/preload/browser-passkey.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(temporary, 'preload/browser-passkey.cjs') });
  const entry = join(temporary, 'lib/runtime.mjs');
  await build({ stdin: { contents: `export { BrowserRuntime } from './runtime.ts'; export { BrowserNativeClient } from './native-client.ts'; export { BrowserSiteStore } from './site-store.ts'; export { WebMCPStore } from './webmcp-store.ts';`, resolveDir: join(root, 'plugins/browser/src'), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: entry });
  const { BrowserRuntime, BrowserNativeClient, BrowserSiteStore, WebMCPStore } = await import(pathToFileURL(entry).href);
  const env = { ...process.env, DEEPDECK_BROWSER_TEST_BUNDLE: join(temporary, 'native.cjs'), DEEPDECK_BROWSER_TEST_PROFILE: join(temporary, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [fileURLToPath(new URL('./browser-devtools-fixture.cjs', import.meta.url))], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  exited = new Promise(resolve => child.once('exit', resolve));
  native = new BrowserNativeClient(child);
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Electron startup timed out')), 20000);
    child.on('message', message => { if (message.type === 'ready') { clearTimeout(timer); resolve(message.origin); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Electron exited: ${code}`)); });
  });
  async function readyTab(id) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const tab = (await native.request({ action: 'snapshot' })).tabs.find(tab => (!id || tab.id === id) && tab.origin === origin && !tab.loading && tab.tools.some(tool => tool.name === 'site_title'));
      if (tab) return tab;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Site tool did not become ready');
  }
  const first = await readyTab();
  const sites = new BrowserSiteStore(join(temporary, 'browser'));
  const site = await sites.ensure(origin);
  const tools = new Map();
  const scope = { tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } }, skills: { register: () => () => {} }, systemPrompt: { section: () => () => {} } };
  const agent = { status: 'idle', session: { id: 'reference-test', header: { cwd: site.workspacePath }, append() { throw new Error('Unexpected session write'); } }, ctx: { inject(_names, apply) { const dispose = apply(scope); return { await: async () => {}, dispose: async () => dispose() }; } } };
  const context = { agents: { get: id => id === agent.session.id ? agent : undefined, list: () => [] }, workspaceRegistry: { create: async path => ({ id: 'workspace', path, title: 'test' }) }, logger: { warn: console.error }, systemPrompt: { assemble: async () => ({}) }, on: () => () => {}, attachments: { saveImages: async () => [] } };
  runtime = new BrowserRuntime(context, native, sites, new WebMCPStore(join(temporary, 'webmcp')));
  const invoke = async (name, args = {}) => JSON.parse(await tools.get(name).execute(args, { agent, signal: new AbortController().signal }));
  const callTool = tool => invoke(tool.callName, {});
  await runtime.bind(site.id, agent.session.id, first.id, 'use');
  const discovered = await invoke('browser_context');
  const title = discovered.tools.find(tool => tool.name === 'site_title');
  assert.equal(title.revision, undefined);
  assert.match(JSON.stringify(await callTool(title)), /DevTools integration/);
  assert(!tools.has('browser_webmcp_call'));
  assert.deepEqual(tools.get(title.callName).parameters, { type: 'object', ...title.inputSchema, properties: title.inputSchema.properties ?? {} });
  const oldCall = tools.get(title.callName);
  assert(!JSON.stringify(discovered).includes('toolRef'));
  assert.match(JSON.stringify(await callTool(title)), /DevTools integration/);
  await invoke('browser_navigate', { url: `${origin}/next` });
  await readyTab(first.id);
  assert(tools.has(title.callName));
  await assert.rejects(oldCall.execute({}, { agent, signal: new AbortController().signal }), /stale_webmcp_tool/);
  const afterNavigation = await invoke('browser_context');
  assert.equal(afterNavigation.catalog.changed, false);
  const fresh = afterNavigation.targets.flatMap(target => target.tools).find(tool => tool.name === 'site_title');
  assert.equal(fresh.callName, title.callName);
  assert.match(JSON.stringify(await callTool(fresh)), /DevTools integration/);
  console.log('PASS native site tool: business-schema call succeeds without identity arguments, navigation rejects old request targets while retaining the same callable schema.');

  await invoke('browser_set_mode', { mode: 'builder' });
  async function install(version) {
    const expectedDigest = (await invoke('webmcp_read_source')).sourceDigest;
    await invoke('webmcp_write_source', { expectedDigest, source: `__deepdeckWebMCP.registerTool({name:'version',description:'Read fixture version',inputSchema:{type:'object'},execute:()=>({version:${version}})})` });
    await invoke('webmcp_apply');
    return (await invoke('browser_list_tools', { names: ['deepdeck_version'] })).tools[0];
  }
  const original = await install(1);
  assert(original.revision);
  assert.deepEqual(await callTool(original), { version: 1 });
  const oldVersionCall = tools.get(original.callName);
  const replacement = await install(2);
  assert(tools.has(original.callName));
  assert.equal(replacement.callName, original.callName);
  assert.deepEqual(await oldVersionCall.execute({}, { agent, signal: new AbortController().signal }).then(JSON.parse), { version: 2 });
  assert.deepEqual(await callTool(replacement), { version: 2 });
  console.log('PASS generated tool: native revision supplied by host, same-schema revision refresh keeps the callable name and updates the next request target.');
} finally {
  runtime?.dispose();
  native?.dispose();
  if (child && child.exitCode === null) {
    if (child.connected) child.send({ type: 'shutdown' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
