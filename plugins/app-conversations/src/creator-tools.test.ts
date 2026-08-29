import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DefaultAppConversationHostRegistry } from './index.js'
import { appCreatorToolDefinitions, installAppCreatorMode } from './creator-tools.js'
import { DEEPDECK_VIBE_APP_SKILL } from './creator-skill.js'
import type { AppConversationHostRegistry } from './contracts.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deepdeck-app-creator-'))
  temporaryRoots.push(root)
  return root
}

describe('App Creator binding', () => {
  it('mounts App tools from the registered source independently of preset switches', () => {
    type Agent = { readonly id: string; readonly ctx: object; readonly session: object; readonly steer: ReturnType<typeof vi.fn> }
    const lifecycle = new Map<string, (...args: never[]) => void>()
    let presetSelected: ((sessionId: string, agentPreset: string) => void) | undefined
    const toolDisposers: Array<ReturnType<typeof vi.fn>> = []
    const skillDisposers: Array<ReturnType<typeof vi.fn>> = []
    const promptDisposers: Array<ReturnType<typeof vi.fn>> = []
    const creatorContext = {
      tools: { register: vi.fn((_definition: unknown) => {
        const dispose = vi.fn()
        toolDisposers.push(dispose)
        return dispose
      }) },
      skills: { register: vi.fn((_definition: unknown) => {
        const dispose = vi.fn()
        skillDisposers.push(dispose)
        return dispose
      }) },
      systemPrompt: { section: vi.fn(() => {
        const dispose = vi.fn()
        promptDisposers.push(dispose)
        return dispose
      }) },
      on: vi.fn(() => vi.fn()),
    }
    const standardContext = {
      tools: { register: vi.fn() },
      skills: { register: vi.fn() },
      systemPrompt: { section: vi.fn() },
      on: vi.fn(() => vi.fn()),
    }
    const currentPreset = new Map<object, string>([
      [creatorContext, 'standard'],
      [standardContext, 'standard'],
    ])
    const creator = { id: 'creator', ctx: creatorContext, session: { id: 'creator', header: { cwd: '/creator' } }, steer: vi.fn() }
    const standard = { id: 'standard', ctx: standardContext, session: { id: 'standard', header: { cwd: '/standard' } }, steer: vi.fn() }
    const live = new Map<string, Agent>([
      [creator.id, creator],
      [standard.id, standard],
    ])
    const host = {
      agents: { get: vi.fn((sessionId: string) => live.get(sessionId)) },
      agentPresets: {
        composedPreset: vi.fn((agentContext: object) => currentPreset.get(agentContext)),
      },
      on: vi.fn((event: string, listener: unknown) => {
        if (event === 'agent-preset/selected') {
          presetSelected = listener as typeof presetSelected
          return () => { presetSelected = undefined }
        }
        lifecycle.set(event, listener as (...args: never[]) => void)
        return () => { lifecycle.delete(event) }
      }),
      sessions: { flush: vi.fn(async () => true) },
      logger: { warn: vi.fn() },
    }
    const registry = {
      isCreatorSource: (cwd: string) => cwd === '/creator',
    } as AppConversationHostRegistry
    const dispose = installAppCreatorMode(host as never, registry)

    lifecycle.get('agent/created')?.({ agent: standard } as never)
    expect(standardContext.tools.register).not.toHaveBeenCalled()
    expect(standardContext.skills.register).not.toHaveBeenCalled()
    expect(standardContext.systemPrompt.section).not.toHaveBeenCalled()

    lifecycle.get('agent/created')?.({ agent: creator } as never)
    expect(creatorContext.tools.register).toHaveBeenCalledTimes(4)
    expect(creatorContext.skills.register).toHaveBeenCalledOnce()
    expect(creatorContext.skills.register).toHaveBeenCalledWith(DEEPDECK_VIBE_APP_SKILL)

    currentPreset.set(creatorContext, 'cordis')
    presetSelected?.(creator.id, 'cordis')
    expect(creatorContext.tools.register).toHaveBeenCalledTimes(4)
    expect(creatorContext.systemPrompt.section).toHaveBeenCalledWith(expect.objectContaining({
      name: 'deepdeck:app-creator',
    }))

    currentPreset.set(creatorContext, 'standard')
    presetSelected?.(creator.id, 'standard')
    for (const stop of toolDisposers) expect(stop).not.toHaveBeenCalled()
    expect(promptDisposers[0]).not.toHaveBeenCalled()

    currentPreset.set(creatorContext, 'cordis')
    presetSelected?.(creator.id, 'cordis')
    expect(creatorContext.tools.register).toHaveBeenCalledTimes(4)
    expect(creatorContext.systemPrompt.section).toHaveBeenCalledTimes(1)

    dispose()
    expect(presetSelected).toBeUndefined()
    for (const stop of toolDisposers) expect(stop).toHaveBeenCalledOnce()
    for (const stop of skillDisposers) expect(stop).toHaveBeenCalledOnce()
  })

  it('uses only the current Creator Workspace for context, rebuild, and restart', async () => {
    const creatorContext = vi.fn(async () => ({
      appId: 'reader',
      title: 'Reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: '/plugins/reader',
      rebuildAvailable: true,
      applyState: { status: 'unknown' as const },
    }))
    const rebuildCreator = vi.fn(async () => ({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      completedAt: '2026-08-23T00:00:00.000Z',
      durationMs: 125,
      hostReloaded: true,
      clientReload: 'not-observed' as const,
      appWindowsReloaded: 1,
      buildLog: 'built',
    }))
    const restartCreator = vi.fn(async () => ({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      restartScheduled: true as const,
    }))
    const registry = { creatorContext, rebuildCreator, restartCreator } as unknown as AppConversationHostRegistry
    const [contextTool, applyTool, rebuildTool, restartTool] = appCreatorToolDefinitions(registry)
    const signal = new AbortController().signal
    const exec = { agent: { session: { header: { cwd: '/plugins/reader' } } }, signal }

    expect(contextTool?.name).toBe('deepdeck_app_context')
    expect(applyTool?.name).toBe('deepdeck_app_apply')
    expect(rebuildTool?.name).toBe('deepdeck_app_rebuild')
    expect(restartTool?.name).toBe('deepdeck_app_restart')
    await expect(contextTool?.execute({}, exec)).resolves.toContain('"appId": "reader"')
    await expect(applyTool?.execute({}, exec)).resolves.toContain('"outcome": "hot-reloaded"')
    await expect(rebuildTool?.execute({}, exec)).resolves.toContain('"appWindowsReloaded": 1')
    await expect(restartTool?.execute({}, exec)).resolves.toContain('"restartScheduled": true')
    expect(creatorContext).toHaveBeenCalledWith('/plugins/reader', signal)
    expect(rebuildCreator).toHaveBeenCalledTimes(2)
    expect(rebuildCreator).toHaveBeenCalledWith('/plugins/reader', signal)
    expect(restartCreator).toHaveBeenCalledWith('/plugins/reader', signal)
  })

  it('confirms readiness only after the live cordis Agent has the source-bound guard', async () => {
    const lifecycle = new Map<string, (...args: never[]) => void>()
    let preset = 'standard'
    const agent = {
      id: 'creator',
      session: { id: 'creator', header: { cwd: '/plugins/reader' } },
      steer: vi.fn(),
      ctx: {
        tools: { register: vi.fn(() => vi.fn()) },
        skills: { register: vi.fn(() => vi.fn()) },
        systemPrompt: { section: vi.fn(() => vi.fn()) },
        on: vi.fn(() => vi.fn()),
      },
    }
    const host = {
      agents: { get: vi.fn(() => agent) },
      agentPresets: { composedPreset: vi.fn(() => preset) },
      sessions: { flush: vi.fn(async () => true) },
      logger: { warn: vi.fn() },
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        lifecycle.set(event, listener)
        return () => { lifecycle.delete(event) }
      }),
    }
    const registry = {
      isCreatorSource: (cwd: string) => cwd === '/plugins/reader',
      creatorContext: vi.fn(async () => ({
        appId: 'reader',
        title: 'Reader',
        packageName: '@deepdeck/reader',
        sourcePackageRoot: '/plugins/reader',
        rebuildAvailable: true,
        applyState: { status: 'unknown' as const },
      })),
    } as unknown as AppConversationHostRegistry
    const creatorMode = installAppCreatorMode(host as never, registry)
    lifecycle.get('agent/created')?.({ agent } as never)

    await expect(creatorMode.assertReady('creator', 'reader')).rejects.toThrow('cordis preset')
    preset = 'cordis'
    await expect(creatorMode.assertReady('creator', 'reader')).resolves.toMatchObject({
      protocolVersion: 3,
      sessionId: 'creator',
      appId: 'reader',
      agentPreset: 'cordis',
      tools: ['deepdeck_app_context', 'deepdeck_app_apply', 'deepdeck_app_rebuild', 'deepdeck_app_restart'],
      skills: ['deepdeck-vibe-app-development'],
    })
    creatorMode()
  })

  it('continues a dirty turn and applies automatically if the reminder is ignored', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'source.js'), 'export const value = 1\n')
    const scoped = new Map<string, (...args: never[]) => unknown>()
    const hostEvents = new Map<string, (...args: never[]) => void>()
    const registered: unknown[] = []
    const session = { id: 'creator', header: { cwd: root } }
    const agent = {
      id: 'creator',
      session,
      steer: vi.fn(),
      ctx: {
        tools: { register: vi.fn((definition: unknown) => { registered.push(definition); return vi.fn() }) },
        skills: { register: vi.fn(() => vi.fn()) },
        systemPrompt: { section: vi.fn(() => vi.fn()) },
        on: vi.fn((event: string, listener: (...args: never[]) => unknown) => {
          scoped.set(event, listener)
          return () => { scoped.delete(event) }
        }),
      },
    }
    const rebuildCreator = vi.fn(async () => ({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      completedAt: '2026-08-24T00:00:00.000Z',
      durationMs: 10,
      hostReloaded: true,
      clientReload: 'not-observed' as const,
      appWindowsReloaded: 0,
      buildLog: 'built',
    }))
    const registry = {
      isCreatorSource: (cwd: string) => cwd === root,
      creatorContext: vi.fn(async () => ({
        appId: 'reader',
        title: 'Reader',
        packageName: '@deepdeck/reader',
        sourcePackageRoot: root,
        rebuildAvailable: true,
        applyState: { status: 'unknown' as const },
      })),
      applyState: vi.fn(async () => ({ status: 'unknown' as const })),
      changedFilesSinceApply: vi.fn(async () => undefined),
      rebuildCreator,
    } as unknown as AppConversationHostRegistry
    const host = {
      agents: { get: vi.fn(() => agent) },
      agentPresets: { composedPreset: vi.fn(() => 'cordis') },
      sessions: { flush: vi.fn(async () => true) },
      logger: { warn: vi.fn() },
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        hostEvents.set(event, listener)
        return () => { hostEvents.delete(event) }
      }),
    }
    const dispose = installAppCreatorMode(host as never, registry)
    hostEvents.get('agent/created')?.({ agent } as never)
    expect(registered).toHaveLength(4)
    await scoped.get('agent/pre-step')?.(
      { agent, turn: 1, signal: new AbortController().signal } as never,
      (async () => ({ kind: 'enter' })) as never,
    )
    await writeFile(join(root, 'source.js'), 'export const value = 2\n')
    const stopping = scoped.get('agent/turn-stopping')
    await stopping?.({ agent, turn: 1, signal: new AbortController().signal } as never)
    expect(agent.steer).toHaveBeenCalledTimes(1)
    expect(agent.steer).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      role: 'user',
      content: [expect.objectContaining({ type: 'text', text: expect.stringContaining('deepdeck_app_apply') })],
      source: { kind: 'plugin', plugin: 'deepdeck-app-apply-guard' },
    }))
    expect(rebuildCreator).not.toHaveBeenCalled()

    await stopping?.({ agent, turn: 1, signal: new AbortController().signal } as never)
    expect(rebuildCreator).toHaveBeenCalledOnce()
    expect(agent.steer).toHaveBeenCalledTimes(2)
    await stopping?.({ agent, turn: 1, signal: new AbortController().signal } as never)
    expect(agent.steer).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('fails closed when the apply guard cannot establish a turn baseline', async () => {
    const scoped = new Map<string, (...args: never[]) => unknown>()
    const hostEvents = new Map<string, (...args: never[]) => void>()
    const session = { id: 'creator', header: { cwd: '/plugins/reader' } }
    const agent = {
      id: 'creator',
      session,
      steer: vi.fn(),
      ctx: {
        tools: { register: vi.fn(() => vi.fn()) },
        skills: { register: vi.fn(() => vi.fn()) },
        systemPrompt: { section: vi.fn(() => vi.fn()) },
        on: vi.fn((event: string, listener: (...args: never[]) => unknown) => {
          scoped.set(event, listener)
          return () => { scoped.delete(event) }
        }),
      },
    }
    const registry = {
      isCreatorSource: () => true,
      creatorContext: vi.fn(async () => ({
        appId: 'reader',
        title: 'Reader',
        packageName: '@deepdeck/reader',
        sourcePackageRoot: '/plugins/reader',
        rebuildAvailable: true,
        applyState: { status: 'unknown' as const },
      })),
    } as unknown as AppConversationHostRegistry
    const host = {
      agents: { get: vi.fn(() => agent) },
      agentPresets: { composedPreset: vi.fn(() => 'cordis') },
      sessions: { flush: vi.fn(async () => true) },
      logger: { warn: vi.fn() },
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        hostEvents.set(event, listener)
        return () => { hostEvents.delete(event) }
      }),
    }
    const dispose = installAppCreatorMode(host as never, registry)
    hostEvents.get('agent/created')?.({ agent } as never)
    const stopping = scoped.get('agent/turn-stopping')
    const payload = { agent, turn: 1, signal: new AbortController().signal } as never

    await expect(stopping?.(payload)).resolves.toBeUndefined()
    expect(agent.steer).toHaveBeenCalledWith(expect.objectContaining({
      content: [expect.objectContaining({ text: expect.stringContaining('failed closed') })],
    }))
    await expect(stopping?.(payload)).rejects.toThrow('failed closed')
    dispose()
  })

  it('queues structural changes and requests restart only after turn-end flush', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'package.json'), '{"name":"@deepdeck/reader","version":"1.0.0"}\n')
    const scoped = new Map<string, (...args: never[]) => unknown>()
    const hostEvents = new Map<string, (...args: never[]) => void>()
    const registered: Array<{ readonly name: string; execute(args: unknown, exec: unknown): Promise<string> }> = []
    const session = { id: 'creator', header: { cwd: root } }
    const agent = {
      id: 'creator',
      session,
      steer: vi.fn(),
      ctx: {
        tools: { register: vi.fn((definition: (typeof registered)[number]) => { registered.push(definition); return vi.fn() }) },
        skills: { register: vi.fn(() => vi.fn()) },
        systemPrompt: { section: vi.fn(() => vi.fn()) },
        on: vi.fn((event: string, listener: (...args: never[]) => unknown) => {
          scoped.set(event, listener)
          return () => { scoped.delete(event) }
        }),
      },
    }
    const order: string[] = []
    const restartCreator = vi.fn(async () => {
      order.push('restart')
      return { appId: 'reader', packageName: '@deepdeck/reader', restartScheduled: true as const }
    })
    const registry = {
      isCreatorSource: (cwd: string) => cwd === root,
      creatorContext: vi.fn(async () => ({
        appId: 'reader',
        title: 'Reader',
        packageName: '@deepdeck/reader',
        sourcePackageRoot: root,
        rebuildAvailable: true,
        applyState: { status: 'unknown' as const },
      })),
      applyState: vi.fn(async () => ({ status: 'unknown' as const })),
      changedFilesSinceApply: vi.fn(async () => undefined),
      validateCreator: vi.fn(async () => ({
        appId: 'reader',
        packageName: '@deepdeck/reader',
        completedAt: '2026-08-24T00:00:00.000Z',
        durationMs: 20,
        installLog: 'installed without lifecycle scripts',
        buildLog: 'built',
      })),
      restartCreator,
    } as unknown as AppConversationHostRegistry
    const flush = vi.fn(async () => { order.push('flush'); return true })
    const host = {
      agents: { get: vi.fn(() => agent) },
      agentPresets: { composedPreset: vi.fn(() => 'cordis') },
      sessions: { flush },
      logger: { warn: vi.fn() },
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        hostEvents.set(event, listener)
        return () => { hostEvents.delete(event) }
      }),
    }
    const dispose = installAppCreatorMode(host as never, registry)
    hostEvents.get('agent/created')?.({ agent } as never)
    await scoped.get('agent/pre-step')?.(
      { agent, turn: 1, signal: new AbortController().signal } as never,
      (async () => ({ kind: 'enter' })) as never,
    )
    await writeFile(join(root, 'package.json'), '{"name":"@deepdeck/reader","version":"1.1.0"}\n')
    const applyTool = registered.find(tool => tool.name === 'deepdeck_app_apply')
    await expect(applyTool?.execute({}, { agent, signal: new AbortController().signal }))
      .resolves.toContain('"outcome": "restart-queued"')
    expect(restartCreator).not.toHaveBeenCalled()

    hostEvents.get('session/event')?.(session as never, { type: 'turn/end' } as never)
    await vi.waitFor(() => expect(restartCreator).toHaveBeenCalledOnce())
    expect(order).toEqual(['flush', 'restart'])
    dispose()
  })

  it('refuses a Creator session without a Workspace before touching the registry', async () => {
    const creatorContext = vi.fn()
    const registry = { creatorContext } as unknown as AppConversationHostRegistry
    const [contextTool] = appCreatorToolDefinitions(registry)

    await expect(contextTool?.execute({}, { signal: new AbortController().signal }))
      .rejects.toThrow('not attached to a Workspace')
    expect(creatorContext).not.toHaveBeenCalled()
  })
})

describe('App source registry', () => {
  it('resolves only registered action tools for the canonical App Workspace', async () => {
    const root = await temporaryRoot()
    const source = join(root, 'source')
    const workspace = join(root, 'DeepDeck', 'Apps', 'reader')
    await mkdir(source)
    await mkdir(workspace, { recursive: true })
    const registry = new DefaultAppConversationHostRegistry(
      { create: vi.fn(async path => ({ id: 'workspace', path, title: path })) },
      root,
    )
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: source,
      actionTools: [
        {
          name: 'reader_set_reply',
          description: 'Set the Reader reply draft.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: { content: { type: 'string' } },
            required: ['content'],
          },
          effect: 'reply.set',
        },
      ],
    })

    expect(registry.actionTools('reader', workspace, ['reader_set_reply']))
      .toEqual([expect.objectContaining({ name: 'reader_set_reply', effect: 'reply.set' })])
    expect(() => registry.actionTools('reader', join(root, 'elsewhere'), ['reader_set_reply']))
      .toThrow('Workspace does not match')
    expect(() => registry.actionTools('reader', workspace, ['reader_missing']))
      .toThrow('is not registered')
  })

  it('resolves the source Workspace and rejects an unrelated Creator cwd', async () => {
    const root = await temporaryRoot()
    const source = join(root, 'reader')
    await mkdir(source)
    const create = vi.fn(async (path: string, title?: string) => ({ id: 'workspace', path, title: title ?? path }))
    const builder = {
      inspect: vi.fn(async () => ({
        packageName: '@deepdeck/reader',
        hotUpdateAvailable: true,
      })),
      preview: vi.fn(async () => ({
        previewId: 'preview',
        packageName: '@deepdeck/reader',
        confirmation: 'confirm',
        hotUpdateAvailable: true,
      })),
      hotUpdate: vi.fn(),
      discard: vi.fn(async () => {}),
    }
    const registry = new DefaultAppConversationHostRegistry({ create }, root, builder)
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: source,
    })

    await expect(registry.resolveCreator('reader')).resolves.toMatchObject({
      appId: 'reader',
      path: source,
      title: 'Creator · Reader',
    })
    await expect(registry.creatorContext(source)).resolves.toMatchObject({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      rebuildAvailable: true,
    })
    await expect(registry.creatorContext(join(root, 'elsewhere')))
      .rejects.toThrow('not a registered DeepDeck App source')
  })

  it('schedules restart only for the App bound to the current Creator Workspace', async () => {
    const root = await temporaryRoot()
    const source = join(root, 'reader')
    await mkdir(source)
    const requestRestart = vi.fn(async () => {})
    const registry = new DefaultAppConversationHostRegistry(
      { create: vi.fn(async path => ({ id: 'workspace', path, title: path })) },
      root,
      undefined,
      { requestRestart } as never,
    )
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: source,
    })

    await expect(registry.restartCreator(source)).resolves.toEqual({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      restartScheduled: true,
    })
    await expect(registry.restartCreator(join(root, 'other')))
      .rejects.toThrow('not a registered DeepDeck App source')
    expect(requestRestart).toHaveBeenCalledOnce()
  })

  it('validates structural Creator changes through the reviewed source build', async () => {
    const root = await temporaryRoot()
    const source = join(root, 'reader')
    await mkdir(source)
    const buildSource = vi.fn(async () => ({
      packageName: '@deepdeck/reader',
      version: '1.1.0',
      sourcePackageRoot: source,
      completedAt: '2026-08-24T01:00:00.000Z',
      logs: { install: 'ignored lifecycle scripts', build: 'built reader' },
    }))
    const discard = vi.fn(async () => {})
    const registry = new DefaultAppConversationHostRegistry(
      { create: vi.fn(async path => ({ id: 'workspace', path, title: path })) },
      root,
      {
        preview: vi.fn(async () => ({
          previewId: 'preview',
          packageName: '@deepdeck/reader',
          confirmation: 'confirm',
          hotUpdateAvailable: true,
        })),
        buildSource,
        hotUpdate: vi.fn(),
        discard,
      },
    )
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: source,
    })

    await expect(registry.validateCreator(source)).resolves.toMatchObject({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      installLog: 'ignored lifecycle scripts',
      buildLog: 'built reader',
    })
    expect(buildSource).toHaveBeenCalledWith({ previewId: 'preview', confirmation: 'confirm' })
    expect(discard).toHaveBeenCalledOnce()
  })
})
