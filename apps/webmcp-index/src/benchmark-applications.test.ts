import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { handle, type Env } from './index.ts'

async function fixture(run: (env: Env) => Promise<void>) {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'benchmark-test', modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-09-11', d1Databases: ['DB'] }] }))
  try {
    const DB = await mf.getD1Database('DB') as unknown as D1Database
    const migrations = new URL('../migrations/', import.meta.url)
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, migrations), 'utf8')
      await DB.batch(sql.replace(/--[^\n]*/g, '').split(';').filter(s => s.trim()).map(s => DB.prepare(s)))
    }
    await run({ DB, SUBMISSIONS: { limit: async () => ({ success: true }) } as RateLimit })
  } finally { await mf.dispose() }
}
const url = 'https://index/api/benchmarks/applications'
const payload = () => ({ id: crypto.randomUUID(), team: ' Test team ', email: 'TEST@example.invalid', target: 'Internal wiki', goal: 'compare', surface: 'screenshots', tasks: 'Find five articles and preserve their sources.', locale: 'zh', consent: true, website: '' })
const post = (value: unknown) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const count = async (env: Env) => (await env.DB.prepare('SELECT count(*) AS total FROM benchmark_applications').first<{ total: number }>())?.total

test('pilot receipts correspond to persisted D1 applications; public responses never disclose contact details', () => fixture(async env => {
  const value = payload(), response = await handle(post(value), env)
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { status: 'received', id: value.id })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const row = await env.DB.prepare('SELECT * FROM benchmark_applications WHERE id = ?').bind(value.id).first()
  assert.equal(row?.team, 'Test team'); assert.equal(row?.email, 'test@example.invalid')
  assert.equal(row?.tasks, value.tasks); assert.equal(row?.status, 'new')
  assert.equal(row?.consent_version, 'benchmark-pilot-2026-09')
  assert(Number(row?.created_at) > 0)
  for (const path of [url, `${url}?id=${value.id}`]) {
    const read = await handle(new Request(path), env)
    assert.equal(read.status, 405); assert.equal(read.headers.get('allow'), 'POST')
    assert.equal((await read.text()).includes(value.email), false)
  }
}))

test('identical retries and concurrent submissions save one application; conflicting retries cannot overwrite it', () => fixture(async env => {
  const value = payload()
  const responses = await Promise.all([handle(post(value), env), handle(post(value), env)])
  for (const response of responses) {
    assert(response.ok); assert.deepEqual(await response.json(), { status: 'received', id: value.id })
  }
  assert.equal(await count(env), 1)
  assert.equal((await handle(post(value), env)).status, 200)
  assert.equal((await handle(post({ ...value, email: 'changed@example.invalid' }), env)).status, 409)
  assert.equal(await count(env), 1)
  assert.equal((await env.DB.prepare('SELECT email FROM benchmark_applications WHERE id = ?').bind(value.id).first())?.email, 'test@example.invalid')
}))

test('invalid, oversized, and bot submissions never reach storage', () => fixture(async env => {
  for (const patch of [{ email: 'invalid' }, { consent: false }, { tasks: 'short' }, { tasks: 'x'.repeat(2001) }, { team: '' }, { target: '' }, { goal: 'unknown' }, { surface: 'unknown' }, { locale: 'unknown' }, { website: 'https://bot.invalid' }, { id: '../invalid' }]) {
    assert.equal((await handle(post({ ...payload(), ...patch }), env)).status, 400)
  }
  assert.equal((await handle(post({ ...payload(), tasks: 'x'.repeat(17000) }), env)).status, 413)
  assert.equal((await handle(new Request(url, { method: 'POST', body: 'not json' }), env)).status, 415)
  assert.equal(await count(env), 0)
}))

test('rate limits and database outages return explicit failures without false receipts', () => fixture(async env => {
  env.SUBMISSIONS = { limit: async ({ key }: { key: string }) => { assert.equal(key, 'benchmark-intake'); return { success: false } } } as RateLimit
  const limited = await handle(post(payload()), env)
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60')
  assert.equal(await count(env), 0)
  env.SUBMISSIONS = { limit: async () => ({ success: true }) } as RateLimit
  const broken = { ...env, DB: { prepare() { throw new Error('private database diagnostic') } } as unknown as D1Database }
  const failed = await handle(post(payload()), broken)
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { error: 'temporarily_unavailable' })
  assert.equal(await count(env), 0)
}))
