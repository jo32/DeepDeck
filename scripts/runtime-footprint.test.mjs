import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { runtimeDependencies, slimRuntime } from './runtime-footprint.mjs';

const exec = promisify(execFile);
test('sidebar pruning is version-gated and preserves host dependencies', () => {
  const dependencies = { ws: '1', yaml: '2', '@deepseek-ai/schemastery': '3', mermaid: '4' };
  assert.deepEqual(runtimeDependencies({ name: 'dsh-better-sidebar', version: '0.21.1', dependencies }),
    { ws: '1', yaml: '2', '@deepseek-ai/schemastery': '3' });
  assert.throws(() => runtimeDependencies({ name: 'dsh-better-sidebar', version: 'next', dependencies }), /Review/);
  assert.equal(runtimeDependencies({ name: 'other', dependencies }), dependencies);
});

test('archives maps, retains target binaries/assets and preserves executable aliases with empty PATH', async t => {
  const base = await mkdtemp(join(tmpdir(), 'runtime footprint '));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'runtime');
  const put = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, { mode: 0o755 });
  };
  const binary = '#!/bin/sh\nprintf "%s\\n" "$@"\n';
  const bun = 'plugins/bun-plugin-builder/node_modules/';
  for (const path of ['bun/bin/bun.exe', 'bun/bin/bunx.exe', '@oven/bun-darwin-aarch64/bin/bun']) await put(bun + path, binary);
  const browser = 'harness/node_modules/@deepdeck/dsh-browser/node_modules/';
  for (const path of ['esbuild/bin/esbuild', '@esbuild/darwin-arm64/bin/esbuild']) await put(browser + path, binary);
  await put('harness/node_modules/node-pty/prebuilds/darwin-arm64/pty.node', 'native');
  await put('harness/node_modules/node-pty/prebuilds/win32-x64/pty.node', 'foreign');
  await put('harness/lib/client.js.map', 'debug');
  await put('harness/lib/world.map', 'asset');
  const debugRoot = join(base, 'debug');
  const report = await slimRuntime(root, { platform: 'darwin', arch: 'arm64', debugRoot });
  assert.equal(report.sourceMapBytes, 5);
  assert.equal(await readFile(join(debugRoot, 'harness/lib/client.js.map'), 'utf8'), 'debug');
  await assert.rejects(stat(join(root, 'harness/lib/client.js.map')), { code: 'ENOENT' });
  await assert.rejects(stat(join(root, 'harness/node_modules/node-pty/prebuilds/win32-x64')), { code: 'ENOENT' });
  assert.equal(await readFile(join(root, 'harness/lib/world.map'), 'utf8'), 'asset');
  assert.equal(await readFile(join(root, 'harness/node_modules/node-pty/prebuilds/darwin-arm64/pty.node'), 'utf8'), 'native');
  for (const [path, expected] of [[bun + 'bun/bin/bunx.exe', 'x\na b\n'], [bun + '@oven/bun-darwin-aarch64/bin/bun', 'a b\n'], [browser + 'esbuild/bin/esbuild', 'a b\n']]) {
    const { stdout } = await exec(join(root, path), ['a b'], { env: { PATH: '' } });
    assert.equal(stdout, expected);
  }
});

test('refuses to replace a binary that differs from its canonical copy', async t => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-mismatch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'plugins/bun-plugin-builder/node_modules/bun/bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'bun.exe'), 'one');
  await writeFile(join(bin, 'bunx.exe'), 'two');
  await assert.rejects(slimRuntime(root, { platform: 'darwin', arch: 'arm64' }), /nonidentical/);
  assert.equal(await readFile(join(bin, 'bunx.exe'), 'utf8'), 'two');
});
