// Run on a desktop session: node apps/desktop/scripts/verify-browser-composer.mjs
import { build } from 'esbuild';
import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'deepdeck-browser-composer-'));
try {
  await build({ entryPoints: [fileURLToPath(new URL('./browser-composer-client.tsx', import.meta.url))],
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(temporary, 'client.js'),
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { react: fileURLToPath(new URL('../node_modules/react', import.meta.url)), 'react-dom': fileURLToPath(new URL('../node_modules/react-dom', import.meta.url)) } });
  await writeFile(join(temporary, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Browser composer verification</title><link rel="stylesheet" href="client.css"><style>html,body,#root{margin:0;height:100%;color-scheme:dark}</style><body data-ds-dark-theme><div id="root"></div><script src="client.js"></script>');
  const env = { ...process.env, DEEPDECK_COMPOSER_ASSETS: temporary };
  delete env.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL('./browser-composer-fixture.cjs', import.meta.url))], { env, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
} finally { await rm(temporary, { recursive: true, force: true }); }
