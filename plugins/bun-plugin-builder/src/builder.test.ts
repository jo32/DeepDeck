import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BunBuildFailure,
  DeepDeckBunPluginBuilder,
  type BunHotReloadAdapter,
  type ProcessRunner,
} from './builder.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
})

async function fixture(options: { readonly bundle?: boolean; readonly lockfile?: boolean } = {}): Promise<{
  readonly bunBinary: string
  readonly source: string
  readonly stateRoot: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'deepdeck-bun-builder-'))
  roots.push(root)
  const source = join(root, 'plugin')
  const stateRoot = join(root, 'state')
  const bunBinary = join(root, 'bun')
  await mkdir(join(source, 'src'), { recursive: true })
  await mkdir(join(source, '.git'), { recursive: true })
  await mkdir(join(source, 'node_modules', 'ignored'), { recursive: true })
  await writeFile(bunBinary, 'test runtime\n', { mode: 0o700 })
  await writeFile(join(source, 'src', 'index.ts'), 'export const value = 1\n')
  await writeFile(join(source, '.git', 'config'), 'must not be copied\n')
  await writeFile(join(source, 'node_modules', 'ignored', 'file'), 'must not be copied\n')
  if (options.bundle !== false) await writeFile(join(source, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(source, 'package.json'), `${JSON.stringify({
    name: '@fixture/dsh-demo',
    version: '1.2.3',
    type: 'module',
    main: 'lib/index.js',
    exports: {
      '.': { default: './lib/index.js' },
      './client': { default: './lib/client.js' },
    },
    dsh: {
      ...(options.bundle === false ? {} : { bundle: { patch: 'cordis.patch.yml' } }),
      client: { platform: 'web' },
    },
    scripts: { build: 'bun build src/index.ts --outdir lib' },
  }, null, 2)}\n`)
  if (options.lockfile === true) await writeFile(join(source, 'bun.lock'), '{}\n')
  return { bunBinary, source, stateRoot }
}

function successfulRunner(calls: Array<{ readonly args: readonly string[]; readonly cwd: string }>): ProcessRunner {
  return async (_command, args, options) => {
    calls.push({ args, cwd: options.cwd })
    if (args[0] === '--version') return { exitCode: 0, signal: null, output: '1.4.0\n', timedOut: false }
    if (args[0] === 'install') return { exitCode: 0, signal: null, output: 'installed\n', timedOut: false }
    if (args[0] === 'run') {
      await mkdir(join(options.cwd, 'lib'), { recursive: true })
      await writeFile(join(options.cwd, 'lib', 'index.js'), 'export const value = 1\n')
      await writeFile(join(options.cwd, 'lib', 'client.js'), 'export function apply() {}\n')
      return { exitCode: 0, signal: null, output: 'built\n', timedOut: false }
    }
    if (args.includes('--dry-run')) {
      return {
        exitCode: 0,
        signal: null,
        output: 'packed 1KB package.json\npacked 1KB cordis.patch.yml\npacked 1KB lib/index.js\npacked 1KB lib/client.js\n',
        timedOut: false,
      }
    }
    const destination = args[args.indexOf('--destination') + 1]
    if (destination === undefined) throw new Error('pack destination missing')
    await writeFile(join(destination, 'fixture-dsh-demo-1.2.3.tgz'), 'packed fixture\n')
    return { exitCode: 0, signal: null, output: 'packed\n', timedOut: false }
  }
}

describe('DeepDeckBunPluginBuilder', () => {
  it('identifies paths owned by its private state root', async () => {
    const paths = await fixture()
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      runProcess: successfulRunner([]),
    })

    expect(builder.isStatePath(join(paths.stateRoot, 'hot', 'fixture'))).toBe(true)
    expect(builder.isStatePath(paths.source)).toBe(false)
    expect(builder.isStatePath('relative/path')).toBe(false)
    builder.close()
  })

  it('reports the bundled runtime after creating its private state root', async () => {
    const paths = await fixture()
    const calls: Array<{ readonly args: readonly string[]; readonly cwd: string }> = []
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      runProcess: successfulRunner(calls),
    })

    await expect(builder.status()).resolves.toEqual({ available: true, busy: false, version: '1.4.0' })
    expect(calls).toEqual([{ args: ['--version'], cwd: paths.stateRoot }])
  })

  it('previews a frozen snapshot and builds one verified tarball', async () => {
    const paths = await fixture({ lockfile: true })
    const calls: Array<{ readonly args: readonly string[]; readonly cwd: string }> = []
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
      runProcess: successfulRunner(calls),
    })

    const preview = await builder.preview({ sourceDirectory: paths.source })
    expect(preview).toMatchObject({
      packageName: '@fixture/dsh-demo',
      version: '1.2.3',
      packageKind: 'bundle',
      bundlePatch: 'cordis.patch.yml',
      confirmation: '@fixture/dsh-demo@1.2.3',
      frozenInstall: true,
      expiresAt: '2026-08-23T00:30:00.000Z',
    })
    await expect(readFile(join(paths.stateRoot, 'jobs', preview.previewId, 'source', '.git', 'config'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(paths.stateRoot, 'jobs', preview.previewId, 'source', 'node_modules', 'ignored', 'file'))).rejects.toMatchObject({ code: 'ENOENT' })

    const result = await builder.build({ previewId: preview.previewId, confirmation: preview.confirmation })
    expect(result).toMatchObject({
      packageName: '@fixture/dsh-demo',
      version: '1.2.3',
      packageKind: 'bundle',
      bundlePatch: 'cordis.patch.yml',
      artifactBytes: 15,
      completedAt: '2026-08-23T00:00:00.000Z',
      logs: {
        install: 'installed\n',
        build: 'built\n',
        pack: 'packed 1KB package.json\npacked 1KB cordis.patch.yml\npacked 1KB lib/index.js\npacked 1KB lib/client.js\npacked\n',
      },
    })
    expect(result.artifactSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(calls.map(call => call.args)).toEqual([
      ['install', '--ignore-scripts', '--linker', 'isolated', '--frozen-lockfile'],
      ['run', 'build'],
      ['pm', 'pack', '--dry-run', '--ignore-scripts'],
      ['pm', 'pack', '--ignore-scripts', '--destination', join(paths.stateRoot, 'artifacts', preview.previewId), '--quiet'],
    ])
    await expect(readFile(join(paths.source, 'lib', 'index.js'))).rejects.toMatchObject({ code: 'ENOENT' })
    await builder.discard(preview.previewId)
    await expect(readFile(result.artifactPath)).resolves.toBeTruthy()
  })

  it('builds an ordinary Cordis plugin mounted by an external profile patch', async () => {
    const paths = await fixture({ bundle: false })
    const calls: Array<{ readonly args: readonly string[]; readonly cwd: string }> = []
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      runProcess: successfulRunner(calls),
    })

    const preview = await builder.preview({ sourceDirectory: paths.source })
    expect(preview).toMatchObject({
      packageName: '@fixture/dsh-demo',
      packageKind: 'plugin',
    })
    expect(preview).not.toHaveProperty('bundlePatch')
    expect(preview.warnings).toContain('This package relies on an external profile or bundle patch to mount it.')

    const result = await builder.build({ previewId: preview.previewId, confirmation: preview.confirmation })
    expect(result).toMatchObject({
      packageName: '@fixture/dsh-demo',
      packageKind: 'plugin',
      artifactBytes: 15,
    })
    expect(result).not.toHaveProperty('bundlePatch')
  })

  it('installs dependencies and builds a reviewed managed source in place', async () => {
    const paths = await fixture({ lockfile: true })
    const calls: Array<{ readonly args: readonly string[]; readonly cwd: string }> = []
    let buildPath: string | undefined
    const baseRunner = successfulRunner(calls)
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      now: () => Date.parse('2026-08-24T02:00:00.000Z'),
      runProcess: async (command, args, options) => {
        if (args[0] === 'run') buildPath = options.environment.PATH
        return await baseRunner(command, args, options)
      },
    })

    const preview = await builder.preview({ sourceDirectory: paths.source })
    const liveSource = await realpath(paths.source)
    const result = await builder.buildSource({
      previewId: preview.previewId,
      confirmation: preview.confirmation,
    })

    expect(result).toMatchObject({
      packageName: '@fixture/dsh-demo',
      version: '1.2.3',
      packageKind: 'bundle',
      sourcePackageRoot: liveSource,
      completedAt: '2026-08-24T02:00:00.000Z',
      logs: { install: 'installed\n', build: 'built\n' },
    })
    expect(calls).toEqual([
      { args: ['install', '--ignore-scripts', '--linker', 'isolated', '--frozen-lockfile'], cwd: liveSource },
      { args: ['run', 'build'], cwd: liveSource },
    ])
    const expectedBunDirectory = process.platform === 'win32'
      ? dirname(paths.bunBinary)
      : join(paths.stateRoot, 'cache', 'bin')
    expect(buildPath?.split(delimiter)[0]).toBe(expectedBunDirectory)
    if (process.platform !== 'win32') {
      await expect(realpath(join(expectedBunDirectory, 'bun'))).resolves.toBe(await realpath(paths.bunBinary))
    }
    await expect(readFile(join(liveSource, 'lib', 'index.js'), 'utf8')).resolves.toContain('value = 1')
  })

  it('builds the reviewed active source in place and replaces its Host entry', async () => {
    const paths = await fixture()
    const calls: Array<{ readonly args: readonly string[]; readonly cwd: string }> = []
    let reloadedEntry: string | undefined
    const liveSource = await realpath(paths.source)
    const hotReload: BunHotReloadAdapter = {
      async inspect(target) {
        return { available: target.sourcePackageRoot === liveSource }
      },
      async reload(target) {
        reloadedEntry = target.hostEntryPath
      },
    }
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      now: () => Date.parse('2026-08-23T01:00:00.000Z'),
      runProcess: successfulRunner(calls),
      hotReload,
    })

    const preview = await builder.preview({ sourceDirectory: paths.source })
    expect(preview.hotUpdateAvailable).toBe(true)
    const result = await builder.hotUpdate({
      previewId: preview.previewId,
      confirmation: preview.confirmation,
    })

    expect(result).toMatchObject({
      packageName: '@fixture/dsh-demo',
      sourcePackageRoot: liveSource,
      hostReloaded: true,
      completedAt: '2026-08-23T01:00:00.000Z',
      buildLog: 'built\n',
    })
    expect(reloadedEntry).toBe(join(liveSource, 'lib', 'index.js'))
    expect(calls).toEqual([{ args: ['run', 'build'], cwd: liveSource }])
    await expect(readFile(join(paths.source, 'lib', 'index.js'), 'utf8')).resolves.toContain('value = 1')
  })

  it('keeps in-place builds disabled when the selected source is not the active package', async () => {
    const paths = await fixture()
    const builder = new DeepDeckBunPluginBuilder({
      ...paths,
      runProcess: successfulRunner([]),
    })

    const preview = await builder.preview({ sourceDirectory: paths.source })
    expect(preview).toMatchObject({
      hotUpdateAvailable: false,
      hotUpdateReason: 'Cordis HMR is unavailable in this runtime.',
    })
    await expect(builder.hotUpdate({
      previewId: preview.previewId,
      confirmation: preview.confirmation,
    })).rejects.toThrow('Cordis HMR is unavailable')
  })

  it('requires the reviewed identity and invalidates a failed snapshot', async () => {
    const paths = await fixture()
    const calls: string[][] = []
    const runner: ProcessRunner = async (_command, args) => {
      calls.push([...args])
      if (args[0] === 'install') return { exitCode: 7, signal: null, output: 'registry unavailable\n', timedOut: false }
      return { exitCode: 0, signal: null, output: '', timedOut: false }
    }
    const builder = new DeepDeckBunPluginBuilder({ ...paths, runProcess: runner })
    const preview = await builder.preview({ sourceDirectory: paths.source })

    await expect(builder.build({ previewId: preview.previewId, confirmation: 'wrong' })).rejects.toThrow('confirmation')
    expect(calls).toHaveLength(0)
    await expect(builder.build({ previewId: preview.previewId, confirmation: preview.confirmation })).rejects.toMatchObject<BunBuildFailure>({
      message: 'install exited with code 7',
      logs: { install: 'registry unavailable\n', build: '', pack: '' },
    })
    await expect(builder.build({ previewId: preview.previewId, confirmation: preview.confirmation })).rejects.toThrow('no longer executable')
  })

  it('runs the bundled Bun install, build, and pack pipeline end to end', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'deepdeck-bun-builder-e2e-'))
    roots.push(stateRoot)
    const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'test-fixtures', 'basic-plugin')
    const bunBinary = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'bun', 'bin', 'bun.exe')
    const builder = new DeepDeckBunPluginBuilder({ bunBinary, stateRoot })

    const preview = await builder.preview({ sourceDirectory: pluginRoot })
    const result = await builder.build({ previewId: preview.previewId, confirmation: preview.confirmation })

    expect(result.packageName).toBe('@fixture/deepdeck-bun-smoke')
    expect(result.artifactPath).toMatch(/\.tgz$/u)
    expect((await readFile(result.artifactPath)).byteLength).toBeGreaterThan(0)
    expect(result.logs.build).toContain('built smoke fixture')
  }, 30_000)
})
