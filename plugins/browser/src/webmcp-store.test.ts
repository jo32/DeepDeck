import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_WEBMCP_SOURCE_BYTES, WebMCPStore } from './webmcp-store.js'

const ORIGIN = 'https://example.com'
const SOURCE = `
type Args = { count?: number };
const sdk = (globalThis as any).__deepdeckWebMCP;
sdk.registerTool({
  name: 'count_articles',
  description: 'Count the matching articles.',
  inputSchema: { type: 'object', properties: {} },
  execute(input: Args) { return { count: input.count ?? 3 }; },
});
`

describe('WebMCPStore', () => {
  let root: string
  let store: WebMCPStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'deepdeck-webmcp-'))
    store = new WebMCPStore(root)
  })

  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('compiles browser TypeScript into an executable IIFE without activating it', async () => {
    await store.writeSource(ORIGIN, SOURCE)
    const build = await store.build(ORIGIN)
    const registered: Array<{ name: string; execute: (input: { count?: number }) => unknown }> = []
    runInNewContext(build.source, { __deepdeckWebMCP: { registerTool: (tool: typeof registered[number]) => registered.push(tool) } })

    expect(registered).toHaveLength(1)
    expect(registered[0]?.name).toBe('count_articles')
    expect(registered[0]?.execute({ count: 8 })).toEqual({ count: 8 })
    expect(await store.inspect(ORIGIN)).toMatchObject({ enabled: false, hasSource: true, revisions: [{ revision: build.revision }] })
    expect(await store.active(ORIGIN)).toBeUndefined()
  })

  it('retains immutable builds, activates only explicitly, and restores the enabled version after restart', async () => {
    await store.writeSource(ORIGIN, SOURCE)
    const first = await store.build(ORIGIN)
    await store.activate(ORIGIN, first.revision)
    await store.writeSource(ORIGIN, SOURCE.replace('?? 3', '?? 4'))
    const second = await store.build(ORIGIN)

    expect(await store.active(ORIGIN)).toEqual(first)
    expect((await store.inspect(ORIGIN)).revisions).toHaveLength(2)
    expect(await readFile(join((await store.inspect(ORIGIN)).workspacePath, 'revisions', first.revision, 'source.ts'), 'utf8')).toBe(SOURCE)
    await store.activate(ORIGIN, second.revision)
    const restarted = new WebMCPStore(root)
    expect(await restarted.active(ORIGIN)).toEqual(second)
    expect(await restarted.inspect(ORIGIN)).toMatchObject({ activeRevision: second.revision, previousRevision: first.revision })
    await restarted.activate(ORIGIN, first.revision)
    expect(await restarted.active(ORIGIN)).toEqual(first)
    expect(await restarted.inspect(ORIGIN)).toMatchObject({ previousRevision: second.revision })
  })

  it('keeps the verified version active when compilation or requested activation fails', async () => {
    await store.writeSource(ORIGIN, SOURCE)
    const working = await store.build(ORIGIN)
    await store.activate(ORIGIN, working.revision)
    await store.writeSource(ORIGIN, 'const broken: = ;')

    await expect(store.build(ORIGIN)).rejects.toThrow()
    await expect(store.activate(ORIGIN, 'a'.repeat(64))).rejects.toThrow()
    expect(await store.active(ORIGIN)).toEqual(working)
    expect((await store.inspect(ORIGIN)).revisions).toHaveLength(1)
  })

  it.each([
    'import "node:fs";',
    'import "./local.ts";',
    'import("https://example.com/code.js");',
    'const path = globalThis.moduleName; import(path);',
    'const path = globalThis.moduleName; require(path);',
  ])('rejects runtime module loading: %s', async source => {
    await store.writeSource(ORIGIN, source)
    await expect(store.build(ORIGIN)).rejects.toThrow()
    expect(await store.active(ORIGIN)).toBeUndefined()
  })

  it('deduplicates identical builds and serializes concurrent operations for one origin', async () => {
    await store.writeSource(ORIGIN, SOURCE)
    const [first, second] = await Promise.all([store.build(ORIGIN), store.build(ORIGIN)])

    expect(first).toEqual(second)
    expect((await store.inspect(ORIGIN)).revisions).toHaveLength(1)
    await Promise.all([store.activate(ORIGIN, first.revision), store.setEnabled(ORIGIN, false)])
    expect(await store.active(ORIGIN)).toBeUndefined()
    await store.setEnabled(ORIGIN, true)
    expect(await store.active(ORIGIN)).toEqual(first)
  })

  it('isolates origins, normalizes page URLs, and rejects foreign revisions and traversal', async () => {
    await store.writeSource(`${ORIGIN}/articles`, SOURCE)
    const first = await store.build(ORIGIN)
    const original = await store.inspect(ORIGIN)
    const other = await store.inspect('https://other.example.com')

    expect(await store.readSource(ORIGIN)).toBe(SOURCE)
    expect(await store.readSource(other.origin)).toBe('')
    expect(other.workspacePath).not.toBe(original.workspacePath)
    await expect(store.activate(other.origin, first.revision)).rejects.toThrow()
    await expect(store.readRevision(ORIGIN, '../../state')).rejects.toThrow('Invalid WebMCP revision')
    await expect(store.inspect('file:///tmp/page')).rejects.toThrow('HTTP or HTTPS')
    await expect(store.inspect('https://user:pass@example.com')).rejects.toThrow('credentials')
  })

  it('rejects oversized source, source symlinks, and symlinked workspace directories', async () => {
    await expect(store.writeSource(ORIGIN, 'x'.repeat(MAX_WEBMCP_SOURCE_BYTES + 1))).rejects.toThrow('at most')
    const state = await store.inspect(ORIGIN)
    const outside = join(root, 'outside.ts')
    await writeFile(outside, SOURCE)
    await symlink(outside, state.sourcePath)
    await expect(store.readSource(ORIGIN)).rejects.toThrow()

    await rm(join(state.workspacePath, 'src'), { recursive: true })
    await symlink(root, join(state.workspacePath, 'src'))
    await expect(store.writeSource(ORIGIN, SOURCE)).rejects.toThrow('unsafe directory')
    expect(await readFile(outside, 'utf8')).toBe(SOURCE)
  })

  it('checks immutable revision integrity before loading or enabling it', async () => {
    await store.writeSource(ORIGIN, SOURCE)
    const build = await store.build(ORIGIN)
    const state = await store.inspect(ORIGIN)
    await writeFile(join(state.workspacePath, 'revisions', build.revision, 'bundle.js'), 'console.log("changed")')

    await expect(store.readRevision(ORIGIN, build.revision)).rejects.toThrow('integrity')
    await expect(store.activate(ORIGIN, build.revision)).rejects.toThrow('integrity')
    expect((await store.inspect(ORIGIN)).enabled).toBe(false)
  })
})
