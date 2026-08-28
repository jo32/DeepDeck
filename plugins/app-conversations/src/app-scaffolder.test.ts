import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeepDeckBunPluginBuilder } from '../../bun-plugin-builder/src/builder.js'
import { scaffoldAppSource } from './app-scaffolder.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deepdeck-app-scaffolder-'))
  roots.push(root)
  return root
}

describe('DeepDeck App scaffolder', () => {
  it('creates a complete Cordis App package with stable Host and Client identities', async () => {
    const root = await fixtureRoot()
    const result = await scaffoldAppSource(join(root, 'plugins'), {
      id: 'project-brief',
      title: 'Project <Brief>',
    })

    expect(result).toEqual({
      appId: 'project-brief',
      title: 'Project <Brief>',
      packageName: '@deepdeck-apps/project-brief',
      sourceDirectory: join(root, 'plugins', 'project-brief'),
    })
    const manifest = JSON.parse(await readFile(join(result.sourceDirectory, 'package.json'), 'utf8')) as {
      name: string
      main: string
      exports: Record<string, unknown>
      dsh: { app: { id: string; title: string }; bundle: { patch: string }; client: { inject: string[] } }
    }
    expect(manifest).toMatchObject({
      name: '@deepdeck-apps/project-brief',
      main: 'lib/index.js',
      dsh: {
        app: { id: 'project-brief', title: 'Project <Brief>' },
        bundle: { patch: './cordis.patch.yml' },
      },
    })
    expect(manifest.exports).toHaveProperty('./client')
    expect(manifest.exports).toHaveProperty('./invariant')
    expect(manifest.dsh.client.inject).toContain('@deepdeck/dsh-app-conversations')

    const host = await readFile(join(result.sourceDirectory, 'src', 'index.js'), 'utf8')
    const client = await readFile(join(result.sourceDirectory, 'src', 'client.js'), 'utf8')
    expect(host).toMatch(/appConversations[\s\S]*webServer\.register[\s\S]*deepdeck:open-app-window/u)
    expect(host).toContain('appWindowPath: PAGE_PATH')
    expect(host).toContain('<h1>Project &lt;Brief&gt;</h1>')
    expect(client).toMatch(/sidebar\.apps[\s\S]*settings\.apps\.item/u)
    expect(client).toContain('function Launcher({ wide = false, closeApps })')
    expect(client).toContain("'data-deepdeck-app-launcher': APP_ID")
    expect(client).toContain('disabled: wide')
    expect(client).not.toContain("style: { width: '100%', justifyContent: 'flex-start' }")
    expect(await readFile(join(result.sourceDirectory, 'cordis.patch.yml'), 'utf8'))
      .toContain("name: '@deepdeck-apps/project-brief'")
    expect(await readFile(join(result.sourceDirectory, 'AGENTS.md'), 'utf8'))
      .toContain('deepdeck_app_apply')
  })

  it('does not overwrite an existing managed source directory', async () => {
    const root = await fixtureRoot()
    const first = await scaffoldAppSource(join(root, 'plugins'), { id: 'notes', title: 'Notes' })
    await writeFile(join(first.sourceDirectory, 'keep.txt'), 'user work\n')

    await expect(scaffoldAppSource(join(root, 'plugins'), { id: 'notes', title: 'Replacement' }))
      .rejects.toThrow(/源码目录已存在/u)
    await expect(readFile(join(first.sourceDirectory, 'keep.txt'), 'utf8')).resolves.toBe('user work\n')
  })

  it('resumes an explicitly matching retained scaffold without overwriting it', async () => {
    const root = await fixtureRoot()
    const pluginRoot = join(root, 'plugins')
    const first = await scaffoldAppSource(pluginRoot, { id: 'notes', title: 'Notes' })
    await writeFile(join(first.sourceDirectory, 'keep.txt'), 'retained work\n')

    await expect(scaffoldAppSource(
      pluginRoot,
      { id: 'notes', title: 'Notes' },
      { reuseExisting: true },
    )).resolves.toEqual(first)
    await expect(readFile(join(first.sourceDirectory, 'keep.txt'), 'utf8')).resolves.toBe('retained work\n')
    await expect(scaffoldAppSource(
      pluginRoot,
      { id: 'notes', title: 'Different Notes' },
      { reuseExisting: true },
    )).rejects.toThrow(/身份与本次创建不一致/u)
  })

  it('passes the real Bun Builder source-build boundary', async () => {
    const root = await fixtureRoot()
    const scaffold = await scaffoldAppSource(join(root, 'plugins'), { id: 'builder-smoke', title: 'Builder Smoke' })
    const builder = new DeepDeckBunPluginBuilder({
      bunBinary: join(import.meta.dirname, '..', '..', 'bun-plugin-builder', 'node_modules', 'bun', 'bin', 'bun.exe'),
      stateRoot: join(root, 'builder-state'),
    })
    try {
      const preview = await builder.preview({ sourceDirectory: scaffold.sourceDirectory })
      expect(preview).toMatchObject({
        packageName: '@deepdeck-apps/builder-smoke',
        packageKind: 'bundle',
        buildScript: 'bun run build.mjs',
      })
      await expect(builder.buildSource({
        previewId: preview.previewId,
        confirmation: preview.confirmation,
      })).resolves.toMatchObject({ packageName: '@deepdeck-apps/builder-smoke' })
      await expect(readFile(join(scaffold.sourceDirectory, 'lib', 'index.js'), 'utf8'))
        .resolves.toContain("const APP_ID = \"builder-smoke\"")
      const client = await readFile(join(scaffold.sourceDirectory, 'lib', 'client.js'), 'utf8')
      expect(client).toContain('window.__ModuleLoader__.load({ id: "@deepdeck-apps/builder-smoke"')
      expect(client).toContain('sidebar.apps')
      expect(client).not.toMatch(/^import\s/mu)
      const registrations: Array<{
        id: string
        factory: (require: (id: string) => object) => { inject?: readonly string[] }
      }> = []
      Function('window', client)({
        __ModuleLoader__: { load: (registration: (typeof registrations)[number]) => registrations.push(registration) },
      })
      expect(registrations).toHaveLength(1)
      expect(registrations[0]?.id).toBe('@deepdeck-apps/builder-smoke')
      expect(registrations[0]?.factory(() => ({})).inject).toEqual(['slots'])
    } finally {
      builder.close()
    }
  })

  it('rejects unsafe App IDs before creating a directory', async () => {
    const root = await fixtureRoot()
    await expect(scaffoldAppSource(join(root, 'plugins'), { id: '../escape', title: 'Escape' }))
      .rejects.toThrow(/App ID/u)
  })
})
