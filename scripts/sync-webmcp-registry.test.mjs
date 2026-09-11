import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '../apps/web/app/api/webmcp/catalog/route.ts';
import { readCatalog, proxySubmission } from '../apps/web/lib/webmcp-index.ts';
import { syncCatalog } from './sync-webmcp-registry.ts';
const empty = { formatVersion: 1, generatedAt: null, entries: [] };
test('unconfigured API labels fallback and never caches it as a live result', async () => {
  delete process.env.WEBMCP_INDEX_URL;
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('x-webmcp-source'), 'bundled');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('website reads changing index data without a build and labels outage fallback', async () => {
  process.env.WEBMCP_INDEX_URL = 'https://index.example.com';
  try {
    const result = await readCatalog(async url => { assert.equal(new URL(url).pathname, '/api/webmcp/catalog'); return Response.json(empty); });
    assert.deepEqual(result, { catalog: empty, source: 'live' });
    assert.equal((await readCatalog(async () => new Response('down', {status:503}))).source, 'bundled');
    assert.equal((await readCatalog(async () => Response.json({bad:true}))).source, 'bundled');
  } finally { delete process.env.WEBMCP_INDEX_URL; }
});
test('publication proxy forwards full packages and preserves indexed and rate-limit responses', async () => {
  process.env.WEBMCP_INDEX_URL = 'https://index.example.com';
  try {
    const body = JSON.stringify({repository:'https://github.com/test/project',source:'x'.repeat(100000),publisherToken:'a'.repeat(64)});
    const req = new Request('https://site/api/webmcp/submissions', {method:'POST', headers:{'content-type':'application/json', authorization:'private'}, body});
    const response = await proxySubmission(req, async (url, init) => {
      assert.equal(new URL(url).hostname, 'index.example.com');
      assert.equal(init.headers.authorization, undefined);
      assert.equal(init.body,body);
      return Response.json({id:'a'.repeat(64),status:'indexed'});
    });
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'indexed');
    const limited = await proxySubmission(new Request('https://site/api/webmcp/submissions?id='+'a'.repeat(64)), async () => Response.json({error:'slow down'}, {status:429}));
    assert.equal(limited.status,429); assert.equal(limited.headers.get('retry-after'),'60');
  } finally { delete process.env.WEBMCP_INDEX_URL; }
});
test('offline sync validates before writing and refuses a bundled outage response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'index-snapshot-'));
  try {
    const paths = ['apps/web/public/webmcp/catalog.json','plugins/browser/catalog.json'];
    for (const path of paths) { await mkdir(join(root,path,'..'),{recursive:true}); await writeFile(join(root,path),'old'); }
    await assert.rejects(syncCatalog(root,'write',async()=>Response.json(empty,{headers:{'x-webmcp-source':'bundled'}})));
    await assert.rejects(syncCatalog(root,'write',async()=>Response.json({bad:true})));
    assert.equal(await readFile(join(root,paths[0]),'utf8'),'old');
    assert.equal(await syncCatalog(root,'write',async()=>Response.json(empty)),0);
    for (const path of paths) assert.deepEqual(JSON.parse(await readFile(join(root,path),'utf8')),empty);
    await syncCatalog(root,'check',async()=>Response.json(empty));
  } finally { await rm(root,{recursive:true,force:true}); }
});
