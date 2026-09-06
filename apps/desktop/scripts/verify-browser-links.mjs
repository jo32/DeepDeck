// Real Electron native routing + unchanged Harness Markdown, temporary profile.
import { build } from 'esbuild';
import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'deepdeck-browser-links-'));
try {
  await build({ entryPoints: [fileURLToPath(new URL('../src/main/windows/browser-window.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(temporary, 'browser.cjs'),
    define: { 'import.meta.dirname': JSON.stringify(join(temporary, 'main/windows')) } });
  await build({ entryPoints: [fileURLToPath(new URL('../src/preload/browser-passkey.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(temporary, 'preload/browser-passkey.cjs') });
  await build({ entryPoints: [fileURLToPath(new URL('./browser-links-client.tsx', import.meta.url))],
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(temporary, 'client.js'),
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { react: fileURLToPath(new URL('../node_modules/react', import.meta.url)), 'react-dom': fileURLToPath(new URL('../node_modules/react-dom', import.meta.url)) } });
  const env = { ...process.env, DEEPDECK_BROWSER_TEST_BUNDLE: join(temporary, 'browser.cjs'),
    DEEPDECK_BROWSER_TEST_PROFILE: join(temporary, 'profile'), DEEPDECK_BROWSER_LINK_ASSETS: temporary };
  delete env.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL('./browser-links-fixture.cjs', import.meta.url))], { env, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
} finally { await rm(temporary, { recursive: true, force: true }); }
