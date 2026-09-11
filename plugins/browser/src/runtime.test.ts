import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as devtoolsClient from './devtools-client.js'
import type { BrowserNativeCommand, BrowserSnapshot, WebMCPScript } from './native-contract.js'
import { BrowserNativeClient } from './native-client.js'
import { BrowserRuntime, type BrowserAgent, type BrowserHostContext } from './runtime.js'
import { BrowserSiteStore, type SiteRecord } from './site-store.js'
import { WebMCPProject, sourceDigest } from './webmcp-project.js'
import { WebMCPStore, type WebMCPState } from './webmcp-store.js'

type Scope = Parameters<Parameters<BrowserAgent['ctx']['inject']>[1]>[0]
type Tool = Parameters<Scope['tools']['register']>[0]
const ORIGIN = 'https://example.com'
const REVISION = 'a'.repeat(64)
const PREVIOUS_REVISION = 'b'.repeat(64)
const GENERATED_TOOL = {
  name: 'deepdeck_articles', description: 'Read articles', inputSchema: { type: 'object' },
  frameId: 'frame-1', documentId: 'document-1', origin: ORIGIN, source: 'deepdeck', revision: REVISION,
} as const

function receipt(script: WebMCPScript): Record<string, unknown> {
  const tool = { ...GENERATED_TOOL, revision: script.revision, origin: script.origin }
  return {
    installed: true, origin: script.origin, revision: script.revision, matched: 1, registered: 1, failed: 0,
    tabs: [{ tabId: 'tab-1', documentId: 'document-1', revision: script.revision, registered: [tool.name], tools: [tool] }],
  }
}

describe('BrowserRuntime', () => {
  let root: string
  let runtime: BrowserRuntime
  let sites: BrowserSiteStore
  let site: SiteRecord
  let snapshot: BrowserSnapshot
  let agent: BrowserAgent
  let tools: Map<string, Tool>
  let skills: Set<unknown>
  let context: BrowserHostContext
  let registered: ReturnType<typeof vi.fn>
  let install: (script: WebMCPScript) => Promise<unknown>
  let call: () => Promise<unknown>
  let request: ReturnType<typeof vi.fn>
  let activate: ReturnType<typeof vi.fn>
  let enabled: boolean
  let activeRevision: string | undefined
  let suppressScope: boolean
  let registrationError: Error | undefined
  let saveImages: ReturnType<typeof vi.fn>
  let listeners: Map<string, unknown>
  let agentStatus: 'idle' | 'running'

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'deepdeck-browser-runtime-'))
    sites = new BrowserSiteStore(root)
    site = await sites.ensure(ORIGIN)
    tools = new Map()
    skills = new Set()
    registered = vi.fn()
    enabled = false
    activeRevision = undefined
    suppressScope = false
    registrationError = undefined
    agentStatus = 'idle'
    const scope: Scope = {
      tools: { register(definition) {
        if (registrationError) throw registrationError
        registered(definition.name)
        tools.set(definition.name, definition)
        return () => { if (tools.get(definition.name) === definition) tools.delete(definition.name) }
      } },
      skills: { register(skill) { skills.add(skill); return () => { skills.delete(skill) } } },
      systemPrompt: { section: () => () => undefined },
    }
    const events: Array<{ type: string; data: unknown }> = []
    agent = {
      get status() { return agentStatus },
      session: { id: 'session-1', header: { cwd: site.workspacePath }, events, append(type, data) { events.push({ type, data }) } },
      ctx: { inject(_names, apply) {
        let dispose: (() => void) | undefined
        let error: unknown
        if (!suppressScope) { try { dispose = apply(scope) } catch (caught) { error = caught } }
        return { async await() { if (error) throw error }, async dispose() { dispose?.() } }
      } },
    }
    snapshot = { open: true, downloads: [], activeTabId: 'tab-1', tabs: [{
      id: 'tab-1', url: `${ORIGIN}/articles`, origin: ORIGIN, title: 'Articles', documentId: 'document-1', loading: false,
      canGoBack: false, canGoForward: false, tools: [GENERATED_TOOL],
    }] }
    saveImages = vi.fn(async () => [{ attachmentId: 'sha256:image', mediaType: 'image/png' as const, bytes: 3, width: 10, height: 20 }])
    listeners = new Map()
    context = {
      agents: { get: id => id === agent.session.id ? agent : undefined, list: () => [] },
      workspaceRegistry: { create: async path => ({ id: 'workspace-1', path, title: 'Browser site' }) },
      logger: { warn: vi.fn() }, attachments: { saveImages },
      systemPrompt: { assemble: vi.fn(async () => ({ tools: [...tools.keys()] })) },
      on: ((event: string, listener: unknown) => { listeners.set(event, listener); return () => { if (listeners.get(event) === listener) listeners.delete(event) } }) as BrowserHostContext['on'],
    }
    const sourceState = (): WebMCPState => ({
      origin: ORIGIN, workspacePath: join(root, 'webmcp'), sourcePath: join(root, 'webmcp', 'src', 'index.ts'),
      hasSource: true, enabled, revisions: [], ...(activeRevision ? { activeRevision } : {}),
    })
    const script = (revision: string) => ({ origin: ORIGIN, revision, source: `compiled-${revision}`, sourceDigest: 'c'.repeat(64), compiledDigest: 'd'.repeat(64) })
    activate = vi.fn(async (_origin: string, revision: string) => { activeRevision = revision; enabled = true; return sourceState() })
    const webmcp = {
      inspect: vi.fn(async () => sourceState()),
      build: vi.fn(async () => script(REVISION)),
      readRevision: vi.fn(async (_origin: string, revision: string) => script(revision)),
      active: vi.fn(async () => enabled && activeRevision ? script(activeRevision) : undefined),
      activate,
      setEnabled: vi.fn(async (_origin: string, value: boolean) => { enabled = value; return sourceState() }),
      readSource: vi.fn(async () => ''), writeSource: vi.fn(async () => sourceState()),
    } as unknown as WebMCPStore
    install = async script => receipt(script)
    call = async () => ({ articles: [{ title: 'Actual result' }] })
    request = vi.fn(async (command: BrowserNativeCommand) => {
      if (command.action === 'snapshot') return snapshot
      if (command.action === 'webmcp.install') return install(command.script)
      if (command.action === 'webmcp.call') return call()
      if (command.action === 'page.screenshot') return { image: 'data:image/png;base64,AQID', documentId: command.documentId } satisfies import('./native-contract.js').BrowserScreenshot
      if (command.action === 'devtools.open') return { id: 'lease-1', wsEndpoint: 'ws://127.0.0.1/test', token: 'test-token' }
      return { ok: true }
    })
    const native = { request, available: true, snapshot, dispose: vi.fn() } as unknown as BrowserNativeClient
    runtime = new BrowserRuntime(context, native, sites, webmcp)
  })

  afterEach(async () => { runtime.dispose(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })

  it('opens one reusable publication project without replacing edits or Git data', async () => {
    activeRevision = REVISION
    const exported = vi.spyOn(runtime, 'exportPackage').mockImplementation(async () => {
      const directory = await mkdtemp(join(site.workspacePath, 'webmcp-publish-'))
      await mkdir(join(directory, 'src'))
      await writeFile(join(directory, 'webmcp.json'), '{}')
      await writeFile(join(directory, 'src/webmcp.ts'), 'original')
      return { directory } as Awaited<ReturnType<BrowserRuntime['exportPackage']>>
    })
    const [first, concurrent] = await Promise.all([runtime.webmcpFiles(site.id), runtime.webmcpFiles(site.id)])
    expect(first!.home).toBe(concurrent!.home)
    expect(exported).toHaveBeenCalledOnce()
    await writeFile(join(first!.home, 'src/webmcp.ts'), 'local edit')
    await mkdir(join(first!.home, '.git'))
    await writeFile(join(first!.home, '.git/config'), 'existing git config')
    activeRevision = PREVIOUS_REVISION
    expect((await runtime.webmcpFiles(site.id))!.home).toBe(first!.home)
    expect(await readFile(join(first!.home, 'src/webmcp.ts'), 'utf8')).toBe('local edit')
    expect(await readFile(join(first!.home, '.git/config'), 'utf8')).toBe('existing git config')
    expect(exported).toHaveBeenCalledOnce()
  })

  const exec = async (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const tool = tools.get(name)
    if (!tool) throw new Error(`Test tool missing: ${name}`)
    return JSON.parse(await tool.execute(args, { agent, signal: new AbortController().signal }))
  }

  it('filters the fallback catalog by the current site and preserves its source status', async () => {
    vi.spyOn(runtime, 'directory').mockResolvedValue({ source: 'bundled', catalog: { formatVersion: 1, generatedAt: null, entries: [
      { id: 'one', repositoryId: 1, repository: 'https://github.com/test/one', manifestPath: 'webmcp.json', name: 'One', description: 'One', origin: ORIGIN, status: 'active', tags: [] },
      { id: 'two', repositoryId: 2, repository: 'https://github.com/test/two', manifestPath: 'webmcp.json', name: 'Two', description: 'Two', origin: 'https://other.example', status: 'active', tags: [] },
    ] } })
    const result = await runtime.catalog(`${ORIGIN}/page`)
    expect(result.source).toBe('bundled')
    expect(result.entries.map(entry => entry.id)).toEqual(['one'])
  })

  const githubCandidate = () => ({
    manifest: { formatVersion: 1 as const, name: 'Articles', description: 'Read articles', version: '1.0.0', origin: ORIGIN, entry: 'src/webmcp.ts', sourceSha256: 'c'.repeat(64), runtime: { id: 'deepdeck-webmcp' as const, sdkVersion: 1 as const }, license: 'MIT', tools: [], tags: [] },
    source: 'source from GitHub', provenance: { repositoryId: 1, repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', commit: 'a'.repeat(40), version: '1.0.0', sourceSha256: 'c'.repeat(64) },
  })

  function workingProject() {
    const upstream = githubCandidate().provenance
    const source = 'local community source with an additional tool'
    const working = { source, upstream, sourceDigest: sourceDigest(source), sourcePath: join(site.workspacePath, 'webmcp-project/src/webmcp.ts') }
    vi.spyOn(WebMCPProject.prototype, 'read').mockResolvedValue(working)
    const state = { directory: join(site.workspacePath, 'webmcp-project'), ...working, changed: true, merging: false, conflicts: [] }
    vi.spyOn(WebMCPProject.prototype, 'state').mockResolvedValue(state)
    vi.spyOn(WebMCPProject.prototype, 'manifest').mockResolvedValue(githubCandidate().manifest)
    const update = vi.spyOn(WebMCPProject.prototype, 'updateManifest').mockResolvedValue(undefined)
    return { working, state, update }
  }

  it('reads and applies the fixed project with upstream identity while preserving the legacy Builder draft', async () => {
    const { working, update } = workingProject()
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')
    expect(await exec('webmcp_read_source')).toMatchObject(working)
    await exec('webmcp_apply')
    expect(runtime.webmcp.build).toHaveBeenCalledWith(ORIGIN, { source: working.source, upstream: working.upstream })
    expect(runtime.webmcp.writeSource).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(working.sourceDigest, expect.arrayContaining([expect.objectContaining({ name: GENERATED_TOOL.name })]))
    expect(activate).toHaveBeenCalledWith(ORIGIN, REVISION)
  })

  it('blocks project activation during a merge and keeps prior tools on validation failure', async () => {
    const { state, update } = workingProject()
    enabled = true; activeRevision = PREVIOUS_REVISION
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')
    state.merging = true
    await expect(exec('webmcp_apply')).rejects.toThrow('finish the upstream merge')
    expect(runtime.webmcp.build).not.toHaveBeenCalled()
    state.merging = false
    update.mockRejectedValue(new Error('Project changed while validating'))
    await expect(exec('webmcp_apply')).rejects.toThrow('changed while validating')
    expect(activeRevision).toBe(PREVIOUS_REVISION)
    expect(activate).not.toHaveBeenCalled()
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'webmcp.install', script: expect.objectContaining({ revision: PREVIOUS_REVISION }) }))
  })

  it('passes the read digest to project writes and rejects switching repositories over an existing project', async () => {
    const { working } = workingProject()
    const write = vi.spyOn(WebMCPProject.prototype, 'write').mockRejectedValue(new Error('Source changed since it was read'))
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')
    await expect(exec('webmcp_write_source', { source: 'new source', expectedDigest: working.sourceDigest })).rejects.toThrow('Source changed')
    expect(write).toHaveBeenCalledWith('new source', working.sourceDigest)
    expect(runtime.webmcp.writeSource).not.toHaveBeenCalled()
    const candidate = githubCandidate(); candidate.provenance.repositoryId = 2; candidate.provenance.repository = 'https://github.com/test/other'
    vi.spyOn(runtime.github, 'load').mockResolvedValue(candidate)
    const preview = await runtime.previewPackage(site.id, candidate.provenance.repository)
    await expect(runtime.installPackage(site.id, preview.token)).rejects.toThrow('already has a community project')
    expect(activate).not.toHaveBeenCalled()
  })

  it('requires the exact preview and consumes it once without refetching or writing the draft', async () => {
    const load = vi.spyOn(runtime.github, 'load').mockResolvedValue(githubCandidate())
    const preview = await runtime.previewPackage(site.id, 'https://github.com/test/webmcp')
    expect(activate).not.toHaveBeenCalled()
    await runtime.installPackage(site.id, preview.token)
    expect(activate).toHaveBeenCalledWith(ORIGIN, REVISION)
    expect(runtime.webmcp.writeSource).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)
    await expect(runtime.installPackage(site.id, preview.token)).rejects.toThrow('expired')
  })

  it('rejects a stale preview when the draft or active revision changes', async () => {
    vi.spyOn(runtime.github, 'load').mockResolvedValue(githubCandidate())
    const preview = await runtime.previewPackage(site.id, 'https://github.com/test/webmcp')
    vi.mocked(runtime.webmcp.readSource).mockResolvedValue('changed during preview')
    await expect(runtime.installPackage(site.id, preview.token)).rejects.toThrow('changed')
    expect(activate).not.toHaveBeenCalled()
    const newer = await runtime.previewPackage(site.id, 'https://github.com/test/webmcp')
    activeRevision = PREVIOUS_REVISION
    await expect(runtime.installPackage(site.id, newer.token)).rejects.toThrow('changed')
  })

  it('restores the previous native script when a GitHub installation does not register', async () => {
    activeRevision = PREVIOUS_REVISION; enabled = true
    vi.spyOn(runtime.github, 'load').mockResolvedValue(githubCandidate())
    const preview = await runtime.previewPackage(site.id, 'https://github.com/test/webmcp')
    install = async script => script.revision === PREVIOUS_REVISION ? receipt(script) : { installed: false }
    await expect(runtime.installPackage(site.id, preview.token)).rejects.toThrow('installation')
    expect(activeRevision).toBe(PREVIOUS_REVISION)
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'webmcp.install', script: expect.objectContaining({ revision: PREVIOUS_REVISION }) }))
    expect(runtime.webmcp.writeSource).not.toHaveBeenCalled()
  })

  it('rejects wrong-site packages before creating an installation preview', async () => {
    const candidate = githubCandidate(); candidate.manifest.origin = 'https://different.example'
    vi.spyOn(runtime.github, 'load').mockResolvedValue(candidate)
    await expect(runtime.previewPackage(site.id, 'https://github.com/test/webmcp')).rejects.toThrow('different site')
  })

  it('binds only the site Workspace Session and a tab on the same origin', async () => {
    await expect(runtime.bind(site.id, 'missing-session', 'tab-1', 'use')).rejects.toThrow('Workspace')
    agent.session.header.cwd = root
    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'use')).rejects.toThrow('Workspace')
    agent.session.header.cwd = site.workspacePath
    snapshot.tabs[0]!.origin = 'https://other.example.com'
    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'use')).rejects.toThrow('different site')
    expect(agent.session.events).toHaveLength(0)
    expect(tools.size).toBe(0)
  })

  it('makes an identical binding idempotent without writing the store or reinstalling Agent tools', async () => {
    const update = vi.spyOn(sites, 'update')
    const first = await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')
    const count = registered.mock.calls.length
    const sourceTool = tools.get('webmcp_read_source')
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')

    expect(update).toHaveBeenCalledTimes(1)
    expect(registered).toHaveBeenCalledTimes(count)
    expect(tools.get('webmcp_read_source')).toBe(sourceTool)
    expect(first.binding).toEqual({ siteId: site.id, sessionId: agent.session.id, tabId: 'tab-1', mode: 'builder' })
    expect(sites.get(site.id)).toMatchObject({ sessionId: agent.session.id, tabId: 'tab-1', mode: 'builder' })
    expect(agent.session.events).toHaveLength(0)
  })

  it('changes modes in the same running conversation through its tool while rejecting external retargeting', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')
    const devtools = tools.get('mcp__chrome_devtools__call_tool')
    expect(devtools).toBeDefined()
    expect(tools.has('mcp__chrome_devtools__list_tools')).toBe(true)
    agent.session.append('turn/start', {})
    agentStatus = 'running'
    await expect(runtime.setMode(site.id, 'builder')).rejects.toThrow('running')
    expect(await exec('browser_set_mode', { mode: 'builder' })).toEqual({ mode: 'builder', ready: true })
    expect(tools.has('webmcp_apply')).toBe(true)
    expect(tools.get('mcp__chrome_devtools__call_tool')).toBe(devtools)
    expect(tools.has('mcp__chrome_devtools__list_tools')).toBe(true)
    expect(skills.size).toBe(2)
    expect(sites.get(site.id).sessionId).toBe('session-1')
    expect(sites.get(site.id).mode).toBe('builder')
    await exec('browser_set_mode', { mode: 'use' })
    expect(tools.has('webmcp_apply')).toBe(false)
    expect(tools.has('browser_webmcp_call')).toBe(true)
    expect(tools.get('mcp__chrome_devtools__call_tool')).toBe(devtools)
    expect(tools.has('mcp__chrome_devtools__list_tools')).toBe(true)
    expect([...skills]).toEqual([expect.objectContaining({ name: 'deepdeck-webmcp-github' })])
  })

  it('reports MCP tool errors as failed Harness executions without replaying the operation', async () => {
    const invoke = vi.fn(async () => ({ isError: true, content: [{ type: 'text' as const, text: 'The page changed during evaluation.' }] }))
    const close = vi.fn(async () => undefined)
    vi.spyOn(devtoolsClient, 'connectDevTools').mockResolvedValue({
      tools: [{ name: 'evaluate_script', inputSchema: { type: 'object' } }], call: invoke, close,
    })
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')

    await expect(exec('mcp__chrome_devtools__call_tool', { name: 'evaluate_script', arguments: { pageId: 1, function: '() => document.title' } })).rejects.toThrow('The page changed during evaluation.')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ action: 'devtools.end', leaseId: 'lease-1' })
  })

  it('allows an idle resumed Agent to rebind after a crash left an unfinished durable turn, without replaying it', async () => {
    await sites.update(site.id, { sessionId: agent.session.id, tabId: 'closed-before-crash', mode: 'use' })
    agent.session.append('turn/start', { turn: 7 })
    agent.session.append('step/start', { turn: 7, step: 1 })
    expect(agent.status).toBe('idle')

    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')).resolves.toMatchObject({ binding: { tabId: 'tab-1', mode: 'builder' } })
    expect(agent.session.events.filter(event => event.type === 'turn/start')).toHaveLength(1)
    expect(agent.session.events.filter(event => event.type === 'turn/end')).toHaveLength(0)
    expect(request.mock.calls.some(([command]) => command.action === 'webmcp.call')).toBe(false)
  })

  it('rejects a target or mode change when the live driver is running even before turn/start is persisted', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')
    agentStatus = 'running'
    expect(agent.session.events.some(event => event.type === 'turn/start')).toBe(false)
    await expect(runtime.setMode(site.id, 'builder')).rejects.toThrow('running')
    expect(sites.get(site.id).mode).toBe('use')
  })

  it('does not retain a mode or first binding when the authoritative site-store write fails', async () => {
    const update = vi.spyOn(sites, 'update')
    update.mockRejectedValueOnce(new Error('site-store persistence failed'))
    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')).rejects.toThrow('persistence')
    expect(sites.bySession(agent.session.id)).toBeUndefined()
    expect(tools.size).toBe(0)
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')
    update.mockRejectedValueOnce(new Error('site-store persistence failed'))
    await expect(exec('browser_set_mode', { mode: 'builder' })).rejects.toThrow('persistence')
    expect(sites.get(site.id).mode).toBe('use')
    expect((await exec('browser_context') as { binding: { mode: string } }).binding.mode).toBe('use')
    expect(tools.has('webmcp_apply')).toBe(false)
    expect(agent.session.events).toHaveLength(0)
  })

  it('rejects missing injected services instead of waiting forever and can retry after services appear', async () => {
    suppressScope = true
    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'use')).rejects.toThrow('could not initialize')
    suppressScope = false
    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'use')).resolves.toMatchObject({ binding: { sessionId: agent.session.id } })
    expect(tools.has('browser_context')).toBe(true)
  })

  it('propagates an injected tool registration failure instead of hanging bind', async () => {
    registrationError = new Error('duplicate tool registration')
    await expect(runtime.bind(site.id, agent.session.id, 'tab-1', 'use')).rejects.toThrow('duplicate tool registration')
  })

  it('awaits saved Session recovery before the first assembled model request and recollects its tools once', async () => {
    await sites.update(site.id, { sessionId: agent.session.id, tabId: 'tab-1', mode: 'builder' })
    const onCreated = listeners.get('agent/created') as (value: { agent: BrowserAgent }) => Promise<void>
    const onAssemble = listeners.get('system-prompt/assemble') as (assembly: unknown, value: { agent: BrowserAgent }, next: () => Promise<unknown>) => Promise<unknown>
    const created = onCreated({ agent })
    const staleAssembly = { tools: [] }
    const next = vi.fn(async () => staleAssembly)
    const first = await onAssemble(staleAssembly, { agent }, next)

    expect(first).toMatchObject({ tools: expect.arrayContaining(['browser_context', 'webmcp_apply']) })
    expect(next).not.toHaveBeenCalled()
    expect(context.systemPrompt.assemble).toHaveBeenCalledTimes(1)
    await created
    const count = registered.mock.calls.length
    await onAssemble({ tools: [...tools.keys()] }, { agent }, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(context.systemPrompt.assemble).toHaveBeenCalledTimes(1)
    expect(registered).toHaveBeenCalledTimes(count)
  })

  it('recovers already-live Agents when the Browser plugin is mounted later', async () => {
    runtime.dispose()
    await sites.update(site.id, { sessionId: agent.session.id, tabId: 'tab-1', mode: 'builder' })
    context.agents.list = () => [agent]
    runtime = new BrowserRuntime(context, runtime.native, sites, runtime.webmcp)
    await vi.waitFor(() => expect(tools.has('webmcp_apply')).toBe(true))
    expect(skills.size).toBe(2)
    expect(agent.session.events).toHaveLength(0)
  })

  it('blocks first model assembly when a saved Browser binding no longer owns the Workspace', async () => {
    await sites.update(site.id, { sessionId: agent.session.id, tabId: 'tab-1', mode: 'use' })
    agent.session.header.cwd = root
    const onAssemble = listeners.get('system-prompt/assemble') as (assembly: unknown, value: { agent: BrowserAgent }, next: () => Promise<unknown>) => Promise<unknown>
    const next = vi.fn(async () => ({ tools: [] }))
    await expect(onAssemble({}, { agent }, next)).rejects.toThrow('Workspace')
    expect(next).not.toHaveBeenCalled()
    expect(tools.size).toBe(0)
  })

  it('restores bindings only from the site store after restart, leaving the tab unbound until explicitly selected', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')
    const saved = await readFile(join(root, 'sites.json'), 'utf8')
    expect(saved).toContain('session-1')
    expect(saved).not.toContain('tab-1')
    expect(agent.session.events).toHaveLength(0)
    runtime.dispose()
    sites = new BrowserSiteStore(root)
    await sites.ready
    expect(sites.bySession(agent.session.id)).toMatchObject({ id: site.id, mode: 'builder' })
    expect(sites.bySession(agent.session.id)?.tabId).toBeUndefined()
    context.agents.list = () => [agent]
    runtime = new BrowserRuntime(context, runtime.native, sites, runtime.webmcp)
    await vi.waitFor(() => expect(tools.has('browser_context')).toBe(true))
    const restored = await exec('browser_context') as { binding: { tabId: string } }
    expect(restored.binding.tabId).toBe('')
    await expect(exec('browser_evaluate', { expression: 'document.title' })).rejects.toThrow('target tab is closed')
    await expect(exec('webmcp_apply')).rejects.toThrow('target tab is closed')
    expect(request.mock.calls.some(([command]) => command.action === 'page.evaluate' || command.action === 'webmcp.install')).toBe(false)
    await exec('browser_select_tab', { tabId: 'tab-1' })
    expect(await exec('browser_webmcp_call', { name: GENERATED_TOOL.name, frameId: 'frame-1', documentId: 'document-1', input: {} })).toEqual({ articles: [{ title: 'Actual result' }] })
    expect(agent.session.events).toHaveLength(0)
  })

  it('keeps both authoritative memory and persisted mode unchanged when atomic site-store replacement fails', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')
    const original = sites.get(site.id)
    const registry = join(root, 'sites.json')
    const backup = join(root, 'sites.backup.json')
    await rename(registry, backup)
    await mkdir(registry)
    try {
      await expect(exec('browser_set_mode', { mode: 'builder' })).rejects.toThrow()
      expect(sites.get(site.id)).toEqual(original)
      expect((await exec('browser_context') as { binding: { mode: string } }).binding.mode).toBe('use')
      expect(tools.has('webmcp_apply')).toBe(false)
    } finally {
      await rm(registry, { recursive: true })
      await rename(backup, registry)
    }
    const restarted = new BrowserSiteStore(root)
    await restarted.ready
    expect(restarted.bySession(agent.session.id)).toMatchObject({ mode: 'use', id: site.id })
    expect(agent.session.events).toHaveLength(0)
  })

  it('waits for the actual WebMCP result and rejects stale documents before dispatch', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')
    let complete!: (value: unknown) => void
    call = () => new Promise(resolve => { complete = resolve })
    const completed = vi.fn()
    const result = exec('browser_webmcp_call', { name: GENERATED_TOOL.name, frameId: 'frame-1', documentId: 'document-1', revision: REVISION, input: {} }).then(value => { completed(); return value })
    await vi.waitFor(() => expect(request.mock.calls.some(([command]) => command.action === 'webmcp.call')).toBe(true))
    expect(completed).not.toHaveBeenCalled()
    complete({ articles: [{ title: 'Actual result' }] })
    expect(await result).toEqual({ articles: [{ title: 'Actual result' }] })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'webmcp.call', tabId: 'tab-1', documentId: 'document-1', revision: REVISION }), expect.any(AbortSignal))
    const dispatched = request.mock.calls.filter(([command]) => command.action === 'webmcp.call').length
    snapshot.tabs[0]!.documentId = 'document-2'
    await expect(exec('browser_webmcp_call', { name: GENERATED_TOOL.name, frameId: 'frame-1', documentId: 'document-1', input: {} })).rejects.toThrow('page changed')
    expect(request.mock.calls.filter(([command]) => command.action === 'webmcp.call')).toHaveLength(dispatched)
  })

  it('rejects a tool invocation from another Agent', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'use')
    await expect(tools.get('browser_context')!.execute({}, { agent: { ...agent }, signal: new AbortController().signal })).rejects.toThrow('bound to this Agent')
  })

  it('uses the packaged directory when the remote index is missing, and accepts a valid live index', async () => {
    const remote = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }))
    const fallback = await runtime.directory()
    expect(fallback.source).toBe('bundled')
    expect(fallback.catalog.formatVersion).toBe(1)
    remote.mockResolvedValue(new Response(JSON.stringify({ formatVersion: 1, generatedAt: null, entries: [] })))
    expect((await runtime.directory()).source).toBe('online')
  })

  function mockPackage(origin = ORIGIN) {
    const candidate = { source: 'verified source', manifest: { formatVersion: 1 as const, name: 'Articles', description: 'Read', origin, version: '1.0.0', entry: 'src/webmcp.ts', sourceSha256: 'c'.repeat(64), runtime: { id: 'deepdeck-webmcp' as const, sdkVersion: 1 as const }, license: 'MIT', tools: [], tags: [] }, provenance: { repositoryId: 1, repository: 'https://github.com/test/webmcp', manifestPath: 'webmcp.json', commit: 'a'.repeat(40), version: '1.0.0', sourceSha256: 'c'.repeat(64), author: { login: 'test', url: 'https://github.com/test', avatarUrl: 'https://github.com/test.png?size=80' } } }
    vi.spyOn(runtime.github, 'load').mockResolvedValue(candidate)
    return candidate
  }

  it('prepares a directory installation from verified source without activating, then consumes confirmation once', async () => {
    const candidate = mockPackage()
    const prepared = await runtime.preparePackage({ repository: candidate.provenance.repository })
    expect(prepared.site.origin).toBe(ORIGIN)
    expect(prepared.preview.provenance.author?.login).toBe('test')
    expect(request).not.toHaveBeenCalled()
    expect(activate).not.toHaveBeenCalled()
    await runtime.installPackage(prepared.site.id, prepared.preview.token, 'http://127.0.0.1:1234/?deepdeck-surface=browser')
    expect(activate).toHaveBeenCalledOnce()
    expect(request.mock.calls.some(([command]) => command.action === 'open')).toBe(false)
    await expect(runtime.installPackage(prepared.site.id, prepared.preview.token)).rejects.toThrow('expired')
  })

  it('rejects a stale confirmation when the Builder draft changes', async () => {
    mockPackage()
    const prepared = await runtime.preparePackage({ repository: 'https://github.com/test/webmcp' })
    vi.mocked(runtime.webmcp.readSource).mockResolvedValue('changed draft')
    await expect(runtime.installPackage(prepared.site.id, prepared.preview.token)).rejects.toThrow('Local WebMCP changed')
    expect(activate).not.toHaveBeenCalled()
  })

  it('opens the verified site before market activation when no matching document is ready', async () => {
    mockPackage()
    const prepared = await runtime.preparePackage({ repository: 'https://github.com/test/webmcp' })
    const tab = snapshot.tabs[0]!
    snapshot.tabs = []
    const normal = request.getMockImplementation()!
    request.mockImplementation(async command => {
      if (command.action === 'open') { expect(command.url).toBe(ORIGIN); snapshot.tabs = [tab]; return snapshot }
      return normal(command)
    })
    await runtime.installPackage(prepared.site.id, prepared.preview.token, 'http://127.0.0.1:1234/?deepdeck-surface=browser')
    expect(request.mock.calls.find(([command]) => command.action === 'open')?.[0]).toMatchObject({ url: ORIGIN })
    expect(activate).toHaveBeenCalledOnce()
  })

  it('activates only after a complete native registration receipt, then still requires functional validation', async () => {
    const order: string[] = []
    install = async script => { order.push('installed'); expect(activate).not.toHaveBeenCalled(); return receipt(script) }
    activate.mockImplementation(async (_origin, revision) => { order.push('activated'); activeRevision = revision; enabled = true; return {} })
    const result = await runtime.activate(site)
    expect(order).toEqual(['installed', 'activated'])
    expect(activate).toHaveBeenCalledWith(ORIGIN, REVISION)
    expect(result).toMatchObject({ activated: true, compiled: true, revision: REVISION, functionalValidation: expect.stringContaining('Call the new tools') })
  })

  it.each([
    {}, { installed: true }, { matched: 1, registered: 1, failed: 0 },
    { installed: true, origin: ORIGIN, revision: REVISION, matched: 0, registered: 0, failed: 0, tabs: [] },
    { installed: true, origin: ORIGIN, revision: REVISION, matched: 1, registered: 1, failed: 0, tabs: [] },
    { ...receipt({ origin: ORIGIN, revision: REVISION, source: '' }), failed: 1 },
    { ...receipt({ origin: ORIGIN, revision: REVISION, source: '' }), origin: 'https://another.example.com' },
  ])('rejects incomplete or unsuccessful install receipts and restores the previously active version: %j', async invalid => {
    activeRevision = PREVIOUS_REVISION
    enabled = true
    install = async script => script.revision === REVISION ? invalid : receipt(script)
    await expect(runtime.activate(site)).rejects.toThrow('installation')
    expect(activate).not.toHaveBeenCalled()
    expect(activeRevision).toBe(PREVIOUS_REVISION)
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'webmcp.install', script: expect.objectContaining({ revision: PREVIOUS_REVISION }) }))
  })

  it('rejects a claimed install whose generated tool belongs to a different page', async () => {
    install = async script => ({ ...receipt(script), tabs: [{ tabId: 'tab-1', documentId: 'document-2', revision: REVISION, registered: [GENERATED_TOOL.name], tools: [GENERATED_TOOL] }] })
    await expect(runtime.activate(site)).rejects.toThrow('different page')
    expect(activate).not.toHaveBeenCalled()
    expect(request).toHaveBeenLastCalledWith({ action: 'webmcp.remove', origin: ORIGIN })
  })

  it('does not enable a stored revision when re-installation fails verification', async () => {
    activeRevision = REVISION
    install = async () => ({ installed: true })
    await expect(runtime.toggle(site.id, true)).rejects.toThrow('installation')
    expect(enabled).toBe(false)
    expect(activate).not.toHaveBeenCalled()
  })

  it('serializes site installation and activation so concurrent versions cannot overwrite one another out of order', async () => {
    let complete!: () => void
    const installed: string[] = []
    install = async script => {
      installed.push(script.revision)
      if (script.revision === PREVIOUS_REVISION) await new Promise<void>(resolve => { complete = resolve })
      return receipt(script)
    }
    const previous = runtime.activate(site, PREVIOUS_REVISION)
    const next = runtime.activate(site, REVISION)
    await vi.waitFor(() => expect(installed).toEqual([PREVIOUS_REVISION]))
    expect(activate).not.toHaveBeenCalled()
    complete()
    await Promise.all([previous, next])
    expect(installed).toEqual([PREVIOUS_REVISION, REVISION])
    expect(activate.mock.calls.map(([, revision]) => revision)).toEqual([PREVIOUS_REVISION, REVISION])
    expect(activeRevision).toBe(REVISION)
  })

  it('persists screenshots as Harness attachments and renders the correct image content', async () => {
    await runtime.bind(site.id, agent.session.id, 'tab-1', 'builder')
    const tool = tools.get('browser_screenshot')!
    const output = await tool.execute({}, { agent, signal: new AbortController().signal })
    const projected = tool.output.render({}, output)
    expect(saveImages).toHaveBeenCalledWith([{ data: Buffer.from([1, 2, 3]), mediaType: 'image/png', name: 'browser-screenshot' }])
    expect(projected).toEqual([{ type: 'image', attachment: { attachmentId: 'sha256:image', mediaType: 'image/png', bytes: 3, width: 10, height: 20 } }])
    expect(output).not.toContain('base64')
  })
})
