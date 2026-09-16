// Starts the actual desktop, without querying or modifying Harness page DOM.
const { app } = require('electron');
const { join } = require('node:path');
const root = process.env.DEEPDECK_BENCHMARK_ROOT;
const profile = process.env.DEEPDECK_BENCHMARK_PROFILE;
if (!root || !profile) throw new Error('Launch through benchmark:webmcp.');
app.setPath('userData', join(profile, 'electron'));
app.setAppPath(join(root, 'apps/desktop'));
let announced = false;
app.on('web-contents-created', (_, contents) => {
  contents.on('did-finish-load', () => {
    if (announced) return;
    try {
      const url = new URL(contents.getURL());
      if (url.protocol === 'http:' && url.hostname === '127.0.0.1') {
        announced = true;
        process.send?.({ type: 'benchmark-shell', url: url.origin, versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node } });
      }
    } catch {}
  });
});
process.on('message', message => { if (message?.type === 'benchmark-stop') app.quit(); });
process.on('disconnect', () => app.quit());
import(join(root, 'apps/desktop/dist/main/index.js')).catch(error => { console.error(error); app.exit(1); });
