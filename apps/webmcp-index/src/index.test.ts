import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { handle, type Env } from './index.ts'
import { digest, MAX_SUBMISSION_BYTES, submissionKey } from '../../../plugins/browser/src/webmcp-submission.ts'

async function fixture(run: (env: Env) => Promise<void>) {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'index-test', modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-09-11', d1Databases: ['DB'] }] }))
  try {
    const DB = await mf.getD1Database('DB') as unknown as D1Database
    const migrations = new URL('../migrations/', import.meta.url)
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, migrations), 'utf8')
      await DB.batch(sql.replace(/--[^\n]*/g, '').split(';').filter(s => s.trim()).map(s => DB.prepare(s)))
    }
    await DB.prepare('DELETE FROM projects').run()
    await run({ DB, SUBMISSIONS: { limit: async () => ({ success: true }) } as RateLimit })
  } finally { await mf.dispose() }
}
const source = 'export const tools = []\n'
const payload = () => ({
  repository: 'https://github.com/test/project', repositoryId: 123, manifestPath: 'webmcp.json', commit: 'a'.repeat(40), publisherToken: 'b'.repeat(64), source,
  manifest: { formatVersion: 1, name: 'Test', description: 'Test project', version: '1.0.0', origin: 'https://example.com', entry: 'webmcp.ts',
    sourceSha256: digest(source), runtime: { id: 'deepdeck-webmcp', sdkVersion: 1 }, license: 'MIT', tools: [], tags: [] },
})
const post = (value: unknown) => new Request('https://index/api/webmcp/submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const catalog = async (env: Env) => (await handle(new Request('https://index/api/webmcp/catalog'), env)).json() as Promise<{ entries: Array<{ name: string; status: string; commit: string; version: string }> }>

test('publication immediately enters D1 and the live catalog without GitHub, a release or a scheduled job', () => fixture(async env => {
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Indexing must not make outbound requests') }
  try {
    const response = await handle(post(payload()), env)
    assert.equal(response.status, 200)
    const receipt = await response.json() as { id: string; status: string }
    assert.equal(receipt.status, 'indexed')
    const listing = (await catalog(env)).entries[0]
    assert.equal(listing?.commit, 'a'.repeat(40)); assert.equal(listing?.version, '1.0.0')
    const status = await (await handle(new Request(`https://index/api/webmcp/submissions?id=${receipt.id}`), env)).json() as { status: string }
    assert.equal(status.status, 'indexed')
    const budget = await env.DB.prepare('SELECT used FROM github_budget').first<{ used: number }>()
    assert.equal(budget?.used, 0)
  } finally { globalThis.fetch = original }
}))

test('retries are idempotent and saved publisher credentials authorize later versions', () => fixture(async env => {
  const value = payload()
  await handle(post(value), env)
  const before = await env.DB.prepare('SELECT checked_at FROM projects').first()
  assert.equal((await handle(post({ ...value, repository: `${value.repository}.git` }), env)).status, 200)
  assert.deepEqual(await env.DB.prepare('SELECT checked_at FROM projects').first(), before)
  value.manifest.version = '1.1.0'; value.commit = 'c'.repeat(40)
  assert.equal((await handle(post(value), env)).status, 200)
  assert.equal((await catalog(env)).entries[0]?.version, '1.1.0')
  const denied = await handle(post({ ...value, publisherToken: 'd'.repeat(64), manifest: { ...value.manifest, name: 'Impersonated' } }), env)
  assert.equal(denied.status, 403); assert.equal((await catalog(env)).entries[0]?.name, 'Test')
  const row = await env.DB.prepare('SELECT publisher_token_hash FROM projects').first<{ publisher_token_hash: string }>()
  assert.equal(row?.publisher_token_hash, digest(value.publisherToken))
}))

test('invalid source, license and metadata cannot create or replace a listing', () => fixture(async env => {
  const value = payload()
  await handle(post(value), env)
  for (const invalid of [
    { repository: value.repository },
    { ...value, repository: 'https://localhost/secrets' },
    { ...value, manifestPath: '../private' },
    { ...value, source: 'different source' },
    { ...value, commit: 'main' },
    { ...value, manifest: { ...value.manifest, license: 'UNLICENSED' } },
  ]) assert.equal((await handle(post(invalid), env)).status, 400)
  assert.equal((await catalog(env)).entries[0]?.commit, value.commit)
  assert.equal((await handle(post({ ...value, source: 'x'.repeat(MAX_SUBMISSION_BYTES) }), env)).status, 413)
}))

test('legacy failed submissions publish directly and disabled records stay disabled', () => fixture(async env => {
  const value = payload(), key = submissionKey(value.repository, value.manifestPath)
  await env.DB.prepare("INSERT INTO projects(key, repository, manifest_path, state, error, created_at) VALUES (?, ?, ?, 'failed', 'Old GitHub quota error', 0)").bind(key, value.repository, value.manifestPath).run()
  const status = await (await handle(new Request(`https://index/api/webmcp/submissions?id=${key}`), env)).json() as { status: string }
  assert.equal(status.status, 'needs_package')
  assert.equal((await handle(post(value), env)).status, 200)
  assert.equal((await catalog(env)).entries[0]?.status, 'active')
  await env.DB.prepare('UPDATE projects SET enabled = 0 WHERE key = ?').bind(key).run()
  assert.equal((await handle(post(value), env)).status, 403)
  assert.equal((await catalog(env)).entries.length, 0)
}))

test('concurrent first publications cannot steal the winning update credential', () => fixture(async env => {
  const results = await Promise.all([handle(post(payload()), env), handle(post({ ...payload(), publisherToken: 'e'.repeat(64) }), env)])
  assert.equal(results.filter(result => result.status === 200).length, 1)
  assert(results.some(result => result.status === 403 || result.status === 409))
  assert.equal((await catalog(env)).entries.length, 1)
}))

test('publication traffic limits and outages are explicit instead of queued success', () => fixture(async env => {
  env.SUBMISSIONS = { limit: async () => ({ success: false }) } as RateLimit
  const limited = await handle(post(payload()), env)
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60')
  assert.equal((await catalog(env)).entries.length, 0)
  assert.equal((await handle(new Request('https://index/unknown'), env)).status, 404)
}))
