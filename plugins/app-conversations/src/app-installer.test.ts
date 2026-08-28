import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeepDeckAppPackageManager,
  type AppInstallerPnpmHandle,
  type AppInstallerPnpmOutcome,
} from './app-installer.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
})

async function pluginRepository(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(path, 'package.json'), `${JSON.stringify({
    name: '@fixture/reader',
    version: '1.2.3',
    main: 'lib/index.js',
    exports: { '.': './lib/index.js', './client': './lib/client.js' },
    dsh: {
      app: { id: 'reader', title: 'Fixture Reader' },
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web' },
    },
    scripts: { build: 'fixture-build' },
  }, null, 2)}\n`)
}

async function ordinaryPluginRepository(path: string): Promise<void> {
  const plugin = join(path, 'packages', 'ordinary')
  await mkdir(plugin, { recursive: true })
  await writeFile(join(plugin, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(plugin, 'package.json'), `${JSON.stringify({
    name: '@fixture/ordinary',
    version: '2.0.0',
    main: 'lib/index.js',
    exports: { '.': './lib/index.js', './client': './lib/client.js' },
    displayName: 'Ordinary Fixture',
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web' },
    },
    scripts: { build: 'fixture-build' },
  }, null, 2)}\n`)
}

function completedHandle(output = ''): AppInstallerPnpmHandle {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  stdout.end(output)
  stderr.end()
  const outcome: AppInstallerPnpmOutcome = { exitCode: 0, signal: null }
  return { stdout, stderr, done: Promise.resolve(outcome), cancel: vi.fn() }
}

function failedHandle(output = ''): AppInstallerPnpmHandle {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  stdout.end()
  stderr.end(output)
  const outcome: AppInstallerPnpmOutcome = { exitCode: 1, signal: null }
  return { stdout, stderr, done: Promise.resolve(outcome), cancel: vi.fn() }
}

async function fixture(): Promise<{
  readonly root: string
  readonly source: string
  readonly home: string
  readonly profile: { readonly name: string; readonly dir: string }
}> {
  const root = await mkdtemp(join(tmpdir(), 'deepdeck-app-installer-'))
  roots.push(root)
  const source = join(root, 'source')
  const home = join(root, 'home')
  const profile = { name: 'web', dir: join(root, 'profile') }
  await pluginRepository(source)
  await mkdir(profile.dir, { recursive: true })
  await writeFile(join(profile.dir, 'package.json'), `${JSON.stringify({
    name: 'fixture-profile',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  })}\n`)
  return { root, source, home, profile }
}

async function mutateProfile(
  profileDirectory: string,
  packageName: string,
  action: 'add' | 'remove',
): Promise<void> {
  const path = join(profileDirectory, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  if (action === 'add') {
    manifest.dependencies[packageName] = 'link:fixture'
    manifest.dsh.profile.bundles.push(packageName)
  } else {
    delete manifest.dependencies[packageName]
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(value => value !== packageName)
  }
  await writeFile(path, `${JSON.stringify(manifest)}\n`)
}

async function addUnmountedDependency(profileDirectory: string, packageName: string): Promise<void> {
  const path = join(profileDirectory, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as {
    dependencies: Record<string, string>
  }
  manifest.dependencies[packageName] = 'link:/legacy/source'
  await writeFile(path, `${JSON.stringify(manifest)}\n`)
}

function builder() {
  return {
    preview: vi.fn(async () => ({
      previewId: '11111111-1111-4111-8111-111111111111',
      packageName: '@fixture/reader',
      version: '1.2.3',
      packageKind: 'bundle' as const,
      confirmation: '@fixture/reader@1.2.3',
      buildScript: 'fixture-build',
      frozenInstall: true,
      warnings: ['build executes local code'],
    })),
    buildSource: vi.fn(async (input: { readonly previewId: string }) => ({
      previewId: input.previewId,
      packageName: '@fixture/reader',
      version: '1.2.3',
      sourcePackageRoot: '/reviewed/source',
      logs: { install: 'bun install\n', build: 'bun build\n' },
    })),
    discard: vi.fn(async () => {}),
  }
}

describe('DeepDeckAppPackageManager', () => {
  it('installs an ordinary DSH bundle from a catalog monorepo package', async () => {
    const paths = await fixture()
    const monorepo = join(paths.root, 'ordinary-monorepo')
    await ordinaryPluginRepository(monorepo)
    const build = {
      preview: vi.fn(async () => ({
        previewId: '44444444-4444-4444-8444-444444444444',
        packageName: '@fixture/ordinary',
        version: '2.0.0',
        packageKind: 'bundle' as const,
        confirmation: '@fixture/ordinary@2.0.0',
        buildScript: 'fixture-build',
        frozenInstall: true,
        warnings: [],
      })),
      buildSource: vi.fn(async (input: { readonly previewId: string }) => ({
        previewId: input.previewId,
        packageName: '@fixture/ordinary',
        version: '2.0.0',
        sourcePackageRoot: '/reviewed/source/packages/ordinary',
        logs: { install: '', build: 'built ordinary plugin\n' },
      })),
      discard: vi.fn(async () => {}),
    }
    const runPluginInstall = vi.fn(async () => {
      await mutateProfile(paths.profile.dir, '@fixture/ordinary', 'add')
      return completedHandle('profile linked\n')
    })
    const manager = new DeepDeckAppPackageManager({
      builder: build,
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall,
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const preview = await manager.preview({
      source: monorepo,
      catalogItemId: 'github:fixture/ordinary',
      expectedPackageName: '@fixture/ordinary',
      displayName: 'Ordinary Plugin',
    })
    expect(preview).toMatchObject({
      title: 'Ordinary Plugin',
      pluginKind: 'plugin',
      packageName: '@fixture/ordinary',
      sourceKind: 'local-directory',
    })
    expect(build.preview).toHaveBeenCalledWith({
      sourceDirectory: expect.any(String),
      packageSubdirectory: 'packages/ordinary',
    }, undefined)

    const result = await manager.install(preview.previewId)
    expect(result).toMatchObject({
      pluginKind: 'plugin',
      packageName: '@fixture/ordinary',
      sourceDirectory: expect.stringMatching(/packages\/ordinary$/u),
      restartRequired: true,
    })
    expect(runPluginInstall).toHaveBeenCalledWith(
      ['add', '--save-exact', `@fixture/ordinary@link:${result.sourceDirectory}`],
      paths.profile.dir,
      expect.objectContaining({ packageName: '@fixture/ordinary' }),
      undefined,
    )
    const inventory = await manager.inventory()
    expect(inventory.catalogItemIds).toContain('github:fixture/ordinary')
    expect(inventory.packageNames).toContain('@fixture/ordinary')
  })

  it('scaffolds, builds, and links a new App into the current profile', async () => {
    const paths = await fixture()
    const build = {
      preview: vi.fn(async (input: { readonly sourceDirectory: string }) => ({
        previewId: '33333333-3333-4333-8333-333333333333',
        packageName: '@deepdeck-apps/daily-notes',
        version: '0.1.0',
        packageKind: 'bundle' as const,
        confirmation: '@deepdeck-apps/daily-notes@0.1.0',
        buildScript: 'bun run build.mjs',
        frozenInstall: false,
        warnings: [],
        sourceDirectory: input.sourceDirectory,
      })),
      buildSource: vi.fn(async (input: { readonly previewId: string }) => ({
        previewId: input.previewId,
        packageName: '@deepdeck-apps/daily-notes',
        version: '0.1.0',
        sourcePackageRoot: '/reviewed/source',
        logs: { install: '', build: 'built starter\n' },
      })),
      discard: vi.fn(async () => {}),
    }
    const runPluginInstall = vi.fn(async () => {
      await mutateProfile(paths.profile.dir, '@deepdeck-apps/daily-notes', 'add')
      return completedHandle('profile linked\n')
    })
    const manager = new DeepDeckAppPackageManager({
      builder: build,
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall,
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const created = await manager.create({ id: 'daily-notes', title: 'Daily Notes' })
    const expectedSource = await realpath(join(paths.home, 'DeepDeck', 'Plugins', 'daily-notes'))

    expect(created).toMatchObject({
      appId: 'daily-notes',
      title: 'Daily Notes',
      packageName: '@deepdeck-apps/daily-notes',
      version: '0.1.0',
      sourceDirectory: expectedSource,
      createdFromTemplate: true,
      restartRequired: true,
    })
    expect(build.preview).toHaveBeenCalledWith({ sourceDirectory: created.sourceDirectory }, undefined)
    expect(runPluginInstall).toHaveBeenCalledWith(
      ['add', '--save-exact', `@deepdeck-apps/daily-notes@link:${created.sourceDirectory}`],
      paths.profile.dir,
      expect.objectContaining({ packageName: '@deepdeck-apps/daily-notes' }),
      undefined,
    )
    await expect(readFile(join(created.sourceDirectory, 'src', 'client.js'), 'utf8'))
      .resolves.toContain("'sidebar.apps'")
  })

  it('copies, builds, and links a local repository into the managed plugin directory', async () => {
    const paths = await fixture()
    const build = builder()
    const runPluginInstall = vi.fn(async (args: readonly string[]) => {
      await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
      return completedHandle('profile linked\n')
    })
    const manager = new DeepDeckAppPackageManager({
      builder: build,
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall,
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const preview = await manager.preview(paths.source)
    expect(preview).toMatchObject({
      appId: 'reader',
      title: 'Fixture Reader',
      packageName: '@fixture/reader',
      sourceKind: 'local-directory',
      sourceDirectory: join(paths.home, 'DeepDeck', 'Plugins', 'reader'),
    })
    const result = await manager.install(preview.previewId)

    expect(result).toMatchObject({
      packageName: '@fixture/reader',
      sourceDirectory: join(paths.home, 'DeepDeck', 'Plugins', 'reader'),
      profileAction: 'install',
      restartRequired: true,
    })
    expect(runPluginInstall).toHaveBeenCalledWith(
      ['add', '--save-exact', `@fixture/reader@link:${result.sourceDirectory}`],
      paths.profile.dir,
      expect.objectContaining({ packageName: '@fixture/reader', packageVersion: '1.2.3' }),
      undefined,
    )
    await expect(readFile(join(result.sourceDirectory, 'package.json'), 'utf8')).resolves.toContain('@fixture/reader')
    await expect(readFile(join(paths.source, 'package.json'), 'utf8')).resolves.toContain('@fixture/reader')
    await expect(manager.updateSource('reader', '@fixture/reader', result.sourceDirectory)).resolves.toEqual({
      sourceDirectory: await realpath(result.sourceDirectory),
      sourceKind: 'local-directory',
      source: paths.source,
    })
  })

  it('repairs a dependency that exists but is missing from profile bundles', async () => {
    const paths = await fixture()
    await addUnmountedDependency(paths.profile.dir, '@fixture/reader')
    const runPluginInstall = vi.fn(async () => {
      await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
      return completedHandle('profile repaired\n')
    })
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall,
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const preview = await manager.preview(paths.source)
    expect(preview.profileAction).toBe('repair')
    await expect(manager.install(preview.previewId)).resolves.toMatchObject({
      packageName: '@fixture/reader',
      profileAction: 'repair',
      restartRequired: true,
    })
    expect(runPluginInstall).toHaveBeenCalledOnce()
  })

  it('does not offer an update when a managed plain directory only points to itself', async () => {
    const paths = await fixture()
    const managed = join(paths.home, 'DeepDeck', 'Plugins', 'reader')
    await pluginRepository(managed)
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall: vi.fn(async () => {
          await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
          return completedHandle()
        }),
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const preview = await manager.preview(managed)
    await manager.install(preview.previewId)
    await expect(manager.updateAvailability('reader', '@fixture/reader', managed)).resolves.toMatchObject({
      available: false,
      reason: expect.stringMatching(/就是当前源码目录/u),
    })
  })

  it('detects and extracts a local ZIP with one repository wrapper', async () => {
    const paths = await fixture()
    const archive = join(paths.root, 'reader.zip')
    const manifest = await readFile(join(paths.source, 'package.json'))
    await writeFile(archive, zipSync({
      'reader-main/package.json': manifest,
      'reader-main/cordis.patch.yml': new TextEncoder().encode('[]\n'),
    }))
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall: vi.fn(async () => {
          await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
          return completedHandle()
        }),
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const preview = await manager.preview(archive)
    expect(preview).toMatchObject({
      appId: 'reader',
      sourceKind: 'local-zip',
    })
    const installed = await manager.install(preview.previewId)
    await expect(manager.updateSource('reader', '@fixture/reader', installed.sourceDirectory)).resolves.toMatchObject({
      sourceKind: 'local-zip',
      source: archive,
    })
  })

  it('records a remote ZIP as the future Agent update source', async () => {
    const paths = await fixture()
    const manifest = await readFile(join(paths.source, 'package.json'))
    const archive = zipSync({
      'reader-main/package.json': manifest,
      'reader-main/cordis.patch.yml': new TextEncoder().encode('[]\n'),
    })
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall: vi.fn(async () => {
          await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
          return completedHandle()
        }),
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
      fetchValue: vi.fn(async () => new Response(archive)) as typeof fetch,
    })

    const preview = await manager.preview('https://example.com/reader.zip')
    const installed = await manager.install(preview.previewId)
    await expect(manager.updateSource('reader', '@fixture/reader', installed.sourceDirectory)).resolves.toMatchObject({
      sourceKind: 'remote-zip',
      source: 'https://example.com/reader.zip',
    })
  })

  it('clones a remote repository when the URL response is not a ZIP', async () => {
    const paths = await fixture()
    const runGit = vi.fn(async (args: readonly string[]) => {
      const destination = args.at(-1)
      if (destination === undefined) throw new Error('missing clone destination')
      await pluginRepository(destination)
      return { exitCode: 0, signal: null, output: 'cloned\n', timedOut: false }
    })
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall: vi.fn(async () => {
          await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
          return completedHandle()
        }),
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
      fetchValue: vi.fn(async () => new Response('<html>repository</html>')) as typeof fetch,
      runGit,
    })

    const preview = await manager.preview('https://example.com/reader')
    expect(preview).toMatchObject({
      sourceKind: 'git-repository',
    })
    expect(runGit).toHaveBeenCalledWith(
      expect.arrayContaining(['clone', 'https://example.com/reader']),
      expect.objectContaining({ cwd: expect.any(String) }),
    )
    const installed = await manager.install(preview.previewId)
    await expect(manager.updateSource('reader', '@fixture/reader', installed.sourceDirectory)).resolves.toMatchObject({
      sourceKind: 'git-repository',
      source: 'https://example.com/reader',
    })
  })

  it('acknowledges its recovery record after a protected App install rolls back', async () => {
    const paths = await fixture()
    const rollbackPluginInstall = vi.fn(async () => true)
    const acknowledgeRecoveredInstall = vi.fn(async () => {})
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin: vi.fn(),
        runPluginInstall: vi.fn(async () => failedHandle('fixture package failure')),
        rollbackPluginInstall,
        acknowledgeRecoveredInstall,
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const preview = await manager.preview(paths.source)
    await expect(manager.install(preview.previewId)).rejects.toThrow('fixture package failure')
    expect(rollbackPluginInstall).toHaveBeenCalledOnce()
    expect(acknowledgeRecoveredInstall).toHaveBeenCalledWith(
      rollbackPluginInstall.mock.calls[0]?.[0],
    )
  })

  it('uninstalls the profile dependency while retaining its Vibe source directory', async () => {
    const paths = await fixture()
    const sourceDirectory = join(paths.home, 'DeepDeck', 'Plugins', 'reader')
    await pluginRepository(sourceDirectory)
    await mutateProfile(paths.profile.dir, '@fixture/reader', 'add')
    const runPlugin = vi.fn((args: readonly string[]) => {
      const done = mutateProfile(paths.profile.dir, '@fixture/reader', 'remove')
        .then(() => ({ exitCode: 0, signal: null } satisfies AppInstallerPnpmOutcome))
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      stdout.end('removed\n')
      stderr.end()
      return { stdout, stderr, done, cancel: vi.fn() }
    })
    const manager = new DeepDeckAppPackageManager({
      builder: builder(),
      profile: paths.profile,
      pnpm: {
        runPlugin,
        runPluginInstall: vi.fn(async () => completedHandle()),
        rollbackPluginInstall: vi.fn(async () => true),
        acknowledgeRecoveredInstall: vi.fn(async () => {}),
      },
      requestRestart: vi.fn(async () => {}),
      homeDirectory: paths.home,
    })

    const result = await manager.uninstall('@fixture/reader', sourceDirectory)
    expect(result).toMatchObject({
      sourceDirectory: await realpath(sourceDirectory),
      sourceRetained: true,
      restartRequired: true,
    })
    expect(runPlugin).toHaveBeenCalledWith(['remove', '@fixture/reader'], paths.profile.dir, undefined)
    await expect(readFile(join(sourceDirectory, 'package.json'), 'utf8')).resolves.toContain('@fixture/reader')
  })
})
