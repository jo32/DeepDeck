import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DefaultAppConversationHostRegistry } from './index.js'
import { appCreatorToolDefinitions, installAppCreatorMode } from './creator-tools.js'
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
  it('registers App tools only on agents composed with Creator mode', () => {
    type Agent = { readonly ctx: object }
    const listeners = new Map<string, (payload: { readonly agent: Agent }) => void>()
    const toolDisposers = [vi.fn(), vi.fn(), vi.fn()]
    const promptDisposer = vi.fn()
    const creatorContext = {
      tools: { register: vi.fn((_definition: unknown) => toolDisposers.shift() ?? vi.fn()) },
      systemPrompt: { section: vi.fn(() => promptDisposer) },
    }
    const standardContext = {
      tools: { register: vi.fn() },
      systemPrompt: { section: vi.fn() },
    }
    const host = {
      agentPresets: {
        composedPreset: vi.fn((agentContext: object) => (
          agentContext === creatorContext ? 'cordis' : 'standard'
        )),
      },
      on: vi.fn((event: string, listener: (payload: { readonly agent: Agent }) => void) => {
        listeners.set(event, listener)
        return () => { listeners.delete(event) }
      }),
    }
    const registry = {} as AppConversationHostRegistry
    const dispose = installAppCreatorMode(host as never, registry)

    listeners.get('agent/created')?.({ agent: { ctx: standardContext } })
    expect(standardContext.tools.register).not.toHaveBeenCalled()
    expect(standardContext.systemPrompt.section).not.toHaveBeenCalled()

    const creator = { ctx: creatorContext }
    listeners.get('agent/created')?.({ agent: creator })
    expect(creatorContext.tools.register).toHaveBeenCalledTimes(3)
    expect(creatorContext.systemPrompt.section).toHaveBeenCalledWith(expect.objectContaining({
      name: 'deepdeck:app-creator',
    }))

    dispose()
    expect(promptDisposer).toHaveBeenCalledOnce()
  })

  it('uses only the current Creator Workspace for context, rebuild, and restart', async () => {
    const creatorContext = vi.fn(async () => ({
      appId: 'reader',
      title: 'Reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: '/plugins/reader',
      rebuildAvailable: true,
    }))
    const rebuildCreator = vi.fn(async () => ({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      completedAt: '2026-08-23T00:00:00.000Z',
      durationMs: 125,
      hostReloaded: true,
      buildLog: 'built',
    }))
    const restartCreator = vi.fn(async () => ({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      restartScheduled: true as const,
    }))
    const registry = { creatorContext, rebuildCreator, restartCreator } as unknown as AppConversationHostRegistry
    const [contextTool, rebuildTool, restartTool] = appCreatorToolDefinitions(registry)
    const signal = new AbortController().signal
    const exec = { agent: { session: { header: { cwd: '/plugins/reader' } } }, signal }

    expect(contextTool?.name).toBe('deepdeck_app_context')
    expect(rebuildTool?.name).toBe('deepdeck_app_rebuild')
    expect(restartTool?.name).toBe('deepdeck_app_restart')
    await expect(contextTool?.execute({}, exec)).resolves.toContain('"appId": "reader"')
    await expect(rebuildTool?.execute({}, exec)).resolves.toContain('"durationMs": 125')
    await expect(restartTool?.execute({}, exec)).resolves.toContain('"restartScheduled": true')
    expect(creatorContext).toHaveBeenCalledWith('/plugins/reader', signal)
    expect(rebuildCreator).toHaveBeenCalledWith('/plugins/reader', signal)
    expect(restartCreator).toHaveBeenCalledWith('/plugins/reader', signal)
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
  it('resolves the source Workspace and rejects an unrelated Creator cwd', async () => {
    const root = await temporaryRoot()
    const source = join(root, 'reader')
    await mkdir(source)
    const create = vi.fn(async (path: string, title?: string) => ({ id: 'workspace', path, title: title ?? path }))
    const builder = {
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
})
