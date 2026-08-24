import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { APP_WORKSPACE_DIRECTORY, DefaultAppConversationHostRegistry } from '../src/index.js'

describe('app conversation Host registry', () => {
  it('creates one ordinary app Workspace under the configured home', async () => {
    const home = await mkdtemp(join(tmpdir(), 'deepdeck-app-conversations-'))
    const create = vi.fn(async (path: string, title?: string) => ({ id: 'workspace-1', path: await realpath(path), title: title ?? 'fallback' }))
    const registry = new DefaultAppConversationHostRegistry({ create }, home)
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@fixture/reader',
      sourcePackageRoot: join(home, 'reader-source'),
    })

    const workspace = await registry.resolve('reader')
    const expectedPath = await realpath(join(home, APP_WORKSPACE_DIRECTORY, 'reader'))

    expect(workspace).toEqual({
      appId: 'reader',
      path: expectedPath,
      title: 'Apps · Reader',
      workspaceId: 'workspace-1',
    })
    expect(create).toHaveBeenCalledWith(join(home, APP_WORKSPACE_DIRECTORY, 'reader'), 'Apps · Reader')
  })

  it('rejects unregistered apps and unsafe directory slugs', async () => {
    const registry = new DefaultAppConversationHostRegistry({
      create: vi.fn(async () => ({ id: 'unused', path: '/unused', title: 'unused' })),
    }, '/tmp/deepdeck-test-home')

    expect(() => registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: '../escape',
      packageName: '@fixture/reader',
      sourcePackageRoot: '/tmp/reader',
    })).toThrow(/invalid app workspace slug/u)
    await expect(registry.resolve('missing')).rejects.toThrow(/unknown app conversation/u)
  })

  it('lists rebuild availability and delegates one reviewed Bun hot update', async () => {
    const preview = vi.fn(async () => ({
      previewId: '11111111-1111-4111-8111-111111111111',
      packageName: '@fixture/reader',
      confirmation: '@fixture/reader@1.0.0',
      hotUpdateAvailable: true,
    }))
    const hotUpdate = vi.fn(async () => ({
      packageName: '@fixture/reader',
      completedAt: '2026-08-23T03:00:00.000Z',
      hostReloaded: true,
      buildLog: 'built reader\n',
    }))
    const discard = vi.fn(async () => {})
    const reloadAppWindows = vi.fn(async () => 2)
    const registry = new DefaultAppConversationHostRegistry({
      create: vi.fn(async () => ({ id: 'unused', path: '/unused', title: 'unused' })),
    }, '/tmp/deepdeck-test-home', { preview, hotUpdate, discard }, undefined, reloadAppWindows)
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@fixture/reader',
      sourcePackageRoot: '/tmp/reader',
      appWindowPath: '/apps/custom-reader',
    })

    await expect(registry.list()).resolves.toEqual([{
      id: 'reader',
      title: 'Reader',
      packageName: '@fixture/reader',
      updateAvailable: false,
      updateReason: 'App package manager is unavailable.',
      rebuildAvailable: true,
      uninstallAvailable: false,
      uninstallReason: 'App package manager is unavailable.',
    }])
    const result = await registry.rebuild('reader')

    expect(result).toMatchObject({
      appId: 'reader',
      packageName: '@fixture/reader',
      completedAt: '2026-08-23T03:00:00.000Z',
      hostReloaded: true,
      clientReload: 'not-observed',
      appWindowsReloaded: 2,
      buildLog: 'built reader\n',
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(hotUpdate).toHaveBeenCalledWith({
      previewId: '11111111-1111-4111-8111-111111111111',
      confirmation: '@fixture/reader@1.0.0',
    })
    expect(discard).toHaveBeenCalledTimes(2)
    expect(reloadAppWindows).toHaveBeenCalledWith('/apps/custom-reader')
  })

  it('keeps the original App source after Cordis reloads its Host from Builder staging', async () => {
    const preview = vi.fn(async () => ({
      previewId: '22222222-2222-4222-8222-222222222222',
      packageName: '@fixture/reader',
      confirmation: '@fixture/reader@1.0.0',
      hotUpdateAvailable: true,
    }))
    const registry = new DefaultAppConversationHostRegistry({
      create: vi.fn(async () => ({ id: 'unused', path: '/unused', title: 'unused' })),
    }, '/tmp/deepdeck-test-home', {
      isStatePath: path => path.startsWith('/tmp/builder-state/'),
      preview,
      hotUpdate: vi.fn(async () => ({
        packageName: '@fixture/reader',
        completedAt: '2026-08-23T03:00:00.000Z',
        hostReloaded: true,
        buildLog: '',
      })),
      discard: vi.fn(async () => {}),
    })
    const unregister = registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@fixture/reader',
      sourcePackageRoot: '/tmp/reader-source',
    })

    unregister()
    registry.register({
      id: 'reader',
      title: 'Reader',
      workspaceSlug: 'reader',
      packageName: '@fixture/reader',
      sourcePackageRoot: '/tmp/builder-state/hot/reader/stage',
    })
    await registry.list()

    expect(preview).toHaveBeenCalledWith({ sourceDirectory: '/tmp/reader-source' }, undefined)
  })
})
