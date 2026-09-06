// Actual Electron website preload -> scoped IPC -> Chrome -> original page.
import { build } from 'esbuild';
import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'deepdeck-passkey-check-'));
try {
  const bundle = join(temporary, 'browser.cjs');
  await build({ stdin: {
    contents: "export { createBrowserWindowManager } from './browser-window.ts'; export { installBrowserPasskeyBridge } from './browser-passkey-bridge.ts'; export { performChromePasskey } from './passkey-chrome.ts'; export { openPasskeyChrome } from './passkey-chrome-pipe.ts';",
    resolveDir: fileURLToPath(new URL('../src/main/windows/', import.meta.url)), loader: 'ts',
  }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: bundle,
  define: { 'import.meta.dirname': JSON.stringify(join(temporary, 'main/windows')) } });
  await build({ entryPoints: [fileURLToPath(new URL('../src/preload/browser-passkey.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(temporary, 'preload/browser-passkey.cjs') });
  const environment = { ...process.env, DEEPDECK_BROWSER_TEST_BUNDLE: bundle, DEEPDECK_BROWSER_TEST_PROFILE: join(temporary, 'profile') };
  delete environment.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL('./browser-passkeys-fixture.cjs', import.meta.url)), ...process.argv.slice(2)],
      { env: environment, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) console.error(`Passkey fixture terminated by ${signal}`);
      resolve(code ?? 1);
    });
  });
} finally { await rm(temporary, { recursive: true, force: true }); }
