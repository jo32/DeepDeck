const { app, session } = require('electron');
const { createServer } = require('node:http');
const { createBrowserWindowManager } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
(async () => {
  await app.whenReady();
  await session.fromPartition('persist:deepdeck-browser').cookies.set({ url: 'https://unrelated-review.invalid', name: 'deepdeck_review_synthetic', value: 'fixture-only' });
  const server = createServer((request, response) => {
    if (request.url === '/api') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ articles: ['one', 'two', 'three'] })); return; }
    response.end(`<title>DevTools integration</title><button id="read" onclick="this.textContent='Clicked'">Read articles</button><input id="query">
      <script>console.log('fixture console');
      document.modelContext.registerTool({name:'site_title',description:'Read title',inputSchema:{type:'object'},execute:()=>document.title});</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const shellServer = createServer((_request, response) => response.end('<title>Trusted Harness fixture</title>'));
  await new Promise(resolve => shellServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const manager = createBrowserWindowManager('DevTools verification', snapshot => process.send?.({ type: 'deepdeck:browser:event', snapshot }));
  process.on('message', message => {
    if (message.type === 'shutdown') { manager.dispose(); server.close(); shellServer.close(); app.quit(); return; }
    if (message.type !== 'deepdeck:browser:request') return;
    void manager.execute(message.command).then(value => process.send?.({ type: 'deepdeck:browser:result', requestId: message.requestId, ok: true, value }), error => process.send?.({ type: 'deepdeck:browser:result', requestId: message.requestId, ok: false, error: String(error) }));
  });
  await manager.execute({ action: 'open', shellUrl: `http://127.0.0.1:${shellServer.address().port}`, url: origin });
  process.send?.({ type: 'ready', origin });
})().catch(error => { console.error(error); app.exit(1); });
