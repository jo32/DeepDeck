import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('../', import.meta.url));
const empty = { formatVersion: 1, generatedAt: null, entries: [] };
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'registry-check-'));
  try {
    for (const path of ['scripts', 'registry/webmcp/entries', 'apps/web/public/webmcp', 'plugins/browser/src']) await mkdir(join(root, path), { recursive: true });
    for (const path of ['scripts/sync-webmcp-registry.ts', 'plugins/browser/src/github-webmcp.ts', 'plugins/browser/src/webmcp-package.ts']) await copyFile(join(source, path), join(root, path));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    const catalog = join(root, 'apps/web/public/webmcp/catalog.json');
    const bundled = join(root, 'plugins/browser/catalog.json');
    const bytes = JSON.stringify(empty);
    await writeFile(catalog, bytes); await writeFile(bundled, bytes);
    const invoke = () => spawnSync(process.execPath, [...process.execArgv.filter(arg => arg !== '--test'), join(root, 'scripts/sync-webmcp-registry.ts'), '--check'], { encoding: 'utf8' });
    await run({ root, catalog, bundled, bytes, invoke });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('empty registry validates without rewriting either snapshot', () => fixture(async ({ catalog, bundled, bytes, invoke }) => {
  const result = invoke(); assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(catalog, 'utf8'), bytes); assert.equal(await readFile(bundled, 'utf8'), bytes);
}));
test('duplicate repository references fail before accessing GitHub', () => fixture(async ({ root, invoke }) => {
  for (const id of ['one', 'two']) await writeFile(join(root, 'registry/webmcp/entries', `${id}.json`), JSON.stringify({ id, repositoryId: 1, repository: 'https://github.com/test/project', manifestPath: 'webmcp.json' }));
  const result = invoke(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Duplicate reference/);
}));
test('invalid paths fail before accessing GitHub', () => fixture(async ({ root, invoke }) => {
  await writeFile(join(root, 'registry/webmcp/entries/invalid.json'), JSON.stringify({ id: 'invalid', repositoryId: 1, repository: 'https://github.com/test/project', manifestPath: '../private.json' }));
  const result = invoke(); assert.notEqual(result.status, 0); assert.match(result.stderr, /path/i);
}));
test('divergent desktop snapshot fails without overwriting it', () => fixture(async ({ bundled, invoke }) => {
  const bytes = JSON.stringify({ ...empty, generatedAt: '2026-09-11T00:00:00Z' });
  await writeFile(bundled, bytes);
  const result = invoke(); assert.notEqual(result.status, 0); assert.match(result.stderr, /snapshots differ/);
  assert.equal(await readFile(bundled, 'utf8'), bytes);
}));
