import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { handle, enqueue, scheduled, discover, type Env } from './index.ts'

async function fixture(run: (env: Env) => Promise<void>) {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'index-test', modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-09-11', d1Databases: ['DB'] }] }))
  try {
    const DB = await mf.getD1Database('DB') as unknown as D1Database
    const sql = await readFile(new URL('../migrations/0001_index.sql', import.meta.url), 'utf8')
    await DB.batch(sql.replace(/--[^\n]*/g, '').split(';').filter(s => s.trim()).map(s => DB.prepare(s)))
    await DB.prepare('DELETE FROM projects').run()
    await run({ DB, SUBMISSIONS: { limit: async () => ({ success: true }) } as RateLimit })
  } finally { await mf.dispose() }
}
const source = 'export const tools = []\n'
const hash = (algorithm: string, value: string) => createHash(algorithm).update(value).digest('hex')
const sha = 'a'.repeat(40), tree = 'b'.repeat(40)
const blob = (value: string) => hash('sha1', `blob ${Buffer.byteLength(value)}\0${value}`)
function transport(options: { badHash?: boolean; private?: boolean; id?: number; fail?: boolean } = {}): typeof fetch {
  const manifest = JSON.stringify({formatVersion:1,name:'Test',description:'Test project',version:'1.0.0',origin:'https://example.com',entry:'webmcp.ts',sourceSha256:options.badHash ? 'f'.repeat(64) : hash('sha256',source),runtime:{id:'deepdeck-webmcp',sdkVersion:1},license:'MIT',tools:[],tags:[]})
  const repo = {id: options.id ?? 123, html_url:'https://github.com/test/project',private:options.private ?? false,default_branch:'main',owner:{login:'test'}}
  return async (input, init) => {
    assert.equal(init?.redirect, 'manual', 'Workers must reject redirects through status checks')
    const path = new URL(String(input)).pathname
    if(options.fail) return new Response('unavailable',{status:503})
    if(path === '/repos/test/project' || path === '/repositories/123') return Response.json(repo)
    if(path.endsWith('/releases/latest')) return new Response('',{status:404})
    if(path.endsWith('/commits/main')) return Response.json({sha})
    if(path.endsWith(`/git/commits/${sha}`)) return Response.json({sha,tree:{sha:tree}})
    if(path.endsWith(`/git/trees/${tree}`)) return Response.json({tree:[{path:'webmcp.json',mode:'100644',type:'blob',sha:blob(manifest),size:Buffer.byteLength(manifest)},{path:'webmcp.ts',mode:'100644',type:'blob',sha:blob(source),size:Buffer.byteLength(source)}]})
    for (const content of [manifest,source]) if(path.endsWith(`/git/blobs/${blob(content)}`)) return Response.json({sha:blob(content),encoding:'base64',content:Buffer.from(content).toString('base64')})
    throw new Error(`Unexpected GitHub path: ${path}`)
  }
}
const post = (repository: string, manifestPath = 'webmcp.json') => new Request('https://index/api/webmcp/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({repository,manifestPath})})
test('submissions deduplicate, wait for actual integrity verification, survive restarts, and refresh without deploys', () => fixture(async env => {
  const first = await handle(post('https://github.com/test/project.git'),env)
  assert.equal(first.status,202)
  const receipt = await first.json() as {id:string}
  const second = await handle(post('https://github.com/TEST/project/'),env)
  assert.equal((await second.json() as {id:string}).id,receipt.id)
  assert.equal((await (await handle(new Request('https://index/api/webmcp/catalog'),env)).json() as {entries:unknown[]}).entries.length,0)
  const now = Date.now()
  await scheduled(env,transport(),now)
  const reconnected = { ...env }
  const catalog = await (await handle(new Request('https://index/api/webmcp/catalog'),reconnected)).json() as {entries:{repositoryId:number;commit:string;version?:string;status:string;syncError?:string}[]}
  assert.equal(catalog.entries.length,1); assert.equal(catalog.entries[0].repositoryId,123); assert.equal(catalog.entries[0].commit,sha); assert.equal(catalog.entries[0].version,undefined)
  const state = await (await handle(new Request(`https://index/api/webmcp/submissions?id=${receipt.id}`),env)).json() as {status:string}
  assert.equal(state.status,'indexed')
  await scheduled(env,transport({fail:true}),now+7*3600_000)
  const failed = await (await handle(new Request('https://index/api/webmcp/catalog'),env)).json() as typeof catalog
  assert.equal(failed.entries.length,1); assert.equal(failed.entries[0].status,'unavailable'); assert(failed.entries[0].syncError)
  await scheduled(env,transport(),now+8*3600_000)
  const recovered = await (await handle(new Request('https://index/api/webmcp/catalog'),env)).json() as typeof catalog
  assert.equal(recovered.entries[0].status,'active'); assert.equal(recovered.entries[0].syncError,undefined)
}))
test('hash mismatch, private repositories and invalid input never become listings', () => fixture(async env => {
  assert.equal((await handle(post('https://localhost/secrets'),env)).status,400)
  assert.equal((await handle(post('https://github.com/test/project','../private'),env)).status,400)
  await enqueue(env,'https://github.com/test/project','webmcp.json')
  await scheduled(env,transport({badHash:true}))
  assert.equal((await (await handle(new Request('https://index/api/webmcp/catalog'),env)).json() as {entries:unknown[]}).entries.length,0)
  await scheduled(env,transport({private:true}),Date.now()+3600_000)
  assert.equal((await env.DB.prepare('SELECT state FROM projects').first<{state:string}>())?.state,'failed')
}))
test('overlapping schedulers claim once; user retries cannot undo backoff or moderation', () => fixture(async env => {
  const row = await enqueue(env,'https://github.com/test/project','webmcp.json')
  assert(row)
  let requests = 0; const remote = transport()
  const request: typeof fetch = async (...args) => {requests++; return remote(...args)}
  const now = Date.now()
  await Promise.all([scheduled(env,request,now),scheduled(env,request,now)])
  assert.equal(requests,8)
  await env.DB.prepare('UPDATE projects SET enabled = 0, next_check = ? WHERE key = ?').bind(now+10000,row.key).run()
  assert.equal((await handle(post('https://github.com/test/project'),env)).status,403)
  assert.equal((await (await handle(new Request('https://index/api/webmcp/catalog'),env)).json() as {entries:unknown[]}).entries.length,0)
}))
test('topic discovery is opt-in, paginated and only creates untrusted candidates', () => fixture(async env => {
  let requests = 0
  const request: typeof fetch = async input => { requests++; assert.match(String(input),/topic:webmcp/); return Response.json({items:[{html_url:'https://github.com/test/project',private:false}],incomplete_results:false}) }
  await discover(env,request); assert.equal(requests,0)
  env.DISCOVER_TOPICS='true'; await discover(env,request); await discover(env,request)
  assert.equal(requests,1); assert.equal((await env.DB.prepare('SELECT state FROM projects').first<{state:string}>())?.state,'pending')
}))
test('rate limits and body limits return explicit failures without enqueuing', () => fixture(async env => {
  env.SUBMISSIONS = {limit: async () => ({success:false})} as RateLimit
  assert.equal((await handle(post('https://github.com/test/project'),env)).status,429)
  env.SUBMISSIONS = {limit: async () => ({success:true})} as RateLimit
  assert.equal((await handle(post('https://github.com/test/project','a'.repeat(3000)),env)).status,400)
  assert.equal((await handle(new Request('https://index/unknown'),env)).status,404)
}))

test('exhausted anonymous GitHub budget defers refresh without invalidating known metadata', () => fixture(async env => {
  const now = Date.now()
  await enqueue(env, 'https://github.com/test/project', 'webmcp.json')
  await scheduled(env, transport(), now)
  const future = now + 7 * 3600_000
  await env.DB.prepare('UPDATE github_budget SET hour = ?, used = 40').bind(Math.floor(future / 3600_000)).run()
  let called = false
  await scheduled(env, async () => { called = true; throw new Error('Must not request GitHub') }, future)
  assert.equal(called, false)
  const row = await env.DB.prepare('SELECT state, error, lease_until FROM projects').first<{state:string; error:string|null;lease_until:number}>()
  assert.equal(row?.state, 'indexed'); assert.equal(row?.error, null); assert.equal(row?.lease_until, 0)
}))
