import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GET } from '../apps/web/app/api/webmcp/catalog/route.ts';
import { parseCatalog, WEBMCP_CATALOG_URL } from '../plugins/browser/src/webmcp-package.ts';

const source = fileURLToPath(new URL('../', import.meta.url));
const empty = { formatVersion: 1, generatedAt: null, entries: [] };
test('official API mirrors the legacy catalog and permits cross-origin client reads', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('cache-control'), /s-maxage=300/);
  const legacy = JSON.parse(await readFile(join(source, 'apps/web/public/webmcp/catalog.json'), 'utf8'));
  assert.deepEqual(await response.json(), parseCatalog(legacy));
  assert.equal(WEBMCP_CATALOG_URL, 'https://deepdeck.getmegaportal.com/api/webmcp/catalog');
});
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
    const invoke = (mode = '--check') => spawnSync(process.execPath, [...process.execArgv.filter(arg => arg !== '--test'), join(root, 'scripts/sync-webmcp-registry.ts'), mode], { encoding: 'utf8' });
    const addProject = async (fail = false) => {
      const ref = { id: 'test-project', repositoryId: 1, repository: 'https://github.com/test/project', manifestPath: 'webmcp.json' };
      await writeFile(join(root, 'registry/webmcp/entries/test.json'), JSON.stringify(ref));
      // Stub only the GitHub transport boundary; exercise the real CLI and filesystem.
      await writeFile(join(root, 'plugins/browser/src/github-webmcp.ts'), `
        export class GitHubWebMCP {
          async repository() { ${fail ? "throw new Error('Upstream unavailable')" : `return ${JSON.stringify({ ...ref, archived: false })}`} }
          async load() { return ${JSON.stringify({ manifest: { name: 'Test project', description: 'An upstream project', origin: 'https://example.com', tags: [], license: 'MIT' }, provenance: { commit: 'a'.repeat(40) } })} }
        }
      `);
    };
    await run({ root, catalog, bundled, bytes, invoke, addProject });
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
test('reference-only PR validates even when both snapshots are old', () => fixture(async ({ catalog, bundled, bytes, invoke, addProject }) => {
  await addProject();
  const result = invoke('--validate'); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Validated 1/);
  assert.equal(await readFile(catalog, 'utf8'), bytes); assert.equal(await readFile(bundled, 'utf8'), bytes);
}));
test('website build publishes additions and removals without rewriting the desktop fallback', () => fixture(async ({ root, catalog, bundled, bytes, invoke, addProject }) => {
  await addProject();
  const added = invoke('--website-only'); assert.equal(added.status, 0, added.stderr);
  const result = JSON.parse(await readFile(catalog, 'utf8'));
  assert.equal(result.entries[0].id, 'test-project');
  assert.equal(result.entries[0].commit, 'a'.repeat(40));
  assert.equal(await readFile(bundled, 'utf8'), bytes);
  await rm(join(root, 'registry/webmcp/entries/test.json'));
  const removed = invoke('--website-only'); assert.equal(removed.status, 0, removed.stderr);
  assert.deepEqual(JSON.parse(await readFile(catalog, 'utf8')).entries, []);
  assert.equal(await readFile(bundled, 'utf8'), bytes);
}));
test('failed upstream validation aborts publication and preserves the previous output', () => fixture(async ({ catalog, bundled, bytes, invoke, addProject }) => {
  await addProject();
  assert.equal(invoke('--website-only').status, 0);
  const previous = await readFile(catalog, 'utf8');
  await addProject(true);
  const result = invoke('--website-only'); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /publication aborted/);
  assert.equal(await readFile(catalog, 'utf8'), previous);
  assert.equal(await readFile(bundled, 'utf8'), bytes);
  assert.notEqual(invoke('--validate').status, 0);
}));
