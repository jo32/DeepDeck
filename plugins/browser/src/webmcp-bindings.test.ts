import { describe, expect, it } from 'vitest'
import { WebMCPBindings } from './webmcp-bindings.js'
import type { BrowserTab } from './native-contract.js'

const page = (): BrowserTab => ({
  id: 'tab', documentId: 'doc', origin: 'https://example.com', url: 'https://example.com', title: 'Page',
  loading: false, canGoBack: false, canGoForward: false,
  tools: [{ name: 'query', description: 'Query', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search text' } } }, frameId: 'frame', documentId: 'doc', origin: 'https://example.com', source: 'site' }],
})

describe('cache-stable WebMCP schemas with frozen execution bindings', () => {
  it('preserves public schemas across sessions, page IDs, revisions and JSON key order', () => {
    const bindings = new WebMCPBindings(), tab = page(), first = bindings.discover(tab)[0]!
    bindings.commit([first])
    tab.tools[0]!.inputSchema = { properties: { query: { description: 'Search text', type: 'string' } }, type: 'object' }
    expect(bindings.discover(tab)[0]!.callName).toBe(first.callName)
    const other = page()
    other.id = 'another-tab'; other.documentId = 'new-doc'
    Object.assign(other.tools[0]!, { frameId: 'another-frame', documentId: 'new-doc', revision: 'new-revision' })
    expect(new WebMCPBindings().discover(other)[0]!.callName).toBe(first.callName)
    expect(() => bindings.resolve(first.callName, other)).toThrow('not_dispatched')
    tab.tools[0]!.inputSchema.required = ['query']
    expect(first.tool.inputSchema).not.toHaveProperty('required')
    expect(bindings.discover(tab)[0]!.callName).not.toBe(first.callName)
  })
  it('makes valid distinct names for Unicode, punctuation collisions and long names', () => {
    const bindings = new WebMCPBindings(), tab = page(), tool = tab.tools[0]!
    tab.tools = ['a.b', 'a_b', '查询订单', 'query'.repeat(50)].map((name, i) => ({ ...tool, name, frameId: `frame-${i}` }))
    const names = bindings.discover(tab).map(tool => tool.callName)
    expect(new Set(names).size).toBe(4)
    for (const name of names) { expect(name).toMatch(/^[a-zA-Z0-9_-]+$/); expect(name.length).toBeLessThanOrEqual(64) }
  })
  it('does not rebind a request on discovery, removal, loading, or clear', () => {
    const bindings = new WebMCPBindings(), tab = page(), entries = bindings.discover(tab), name = entries[0]!.callName
    bindings.commit(entries)
    tab.documentId = 'next-doc'; tab.tools[0]!.documentId = 'next-doc'
    const next = bindings.discover(tab)
    expect(next[0]!.callName).toBe(name)
    expect(() => bindings.resolve(name, tab)).toThrow('not_dispatched')
    bindings.discover(tab)
    expect(() => bindings.resolve(name, tab)).toThrow('not_dispatched')
    bindings.commit(next)
    expect(bindings.resolve(name, tab).documentId).toBe('next-doc')
    tab.loading = true
    expect(bindings.discover(tab)).toEqual([])
    expect(() => bindings.resolve(name, tab)).toThrow('not_dispatched')
    tab.loading = false
    expect(bindings.discover(tab)[0]!.callName).toBe(name)
    expect(() => bindings.resolve(name, tab)).toThrow('not_dispatched')
    bindings.commit(bindings.discover(tab)); bindings.clear()
    expect(() => bindings.resolve(name, tab)).toThrow('not_dispatched')
    bindings.commit([])
    expect(() => bindings.resolve(name, tab)).toThrow('not_dispatched')
  })
  it('keeps duplicate frame targets distinct and isolated from other sessions', () => {
    const bindings = new WebMCPBindings(), tab = page(), tool = tab.tools[0]!
    tab.tools.push(structuredClone(tool), { ...tool, frameId: 'child' })
    const entries = bindings.discover(tab)
    expect(entries).toHaveLength(2)
    bindings.commit(entries)
    const child = entries.find(entry => entry.tool.frameId === 'child')!
    expect(bindings.resolve(child.callName, tab).frameId).toBe('child')
    const other = new WebMCPBindings()
    other.discover(tab)
    expect(() => other.resolve(child.callName, tab)).toThrow('stale_webmcp_tool')
    tab.tools = [{ ...tool, frameId: 'new-frame' }]
    expect(() => bindings.resolve(child.callName, tab)).toThrow('not_dispatched')
  })
})
