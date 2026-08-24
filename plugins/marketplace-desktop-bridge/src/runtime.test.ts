import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DeepDeckCommunityMarketPnpm,
  restrictAddedProfileBundles,
  resolveCommunityMarketProfile,
  resolveDshHome,
} from './runtime.js'

describe('Community Market runtime paths', () => {
  it('resolves DSH_HOME and the web profile consistently', () => {
    expect(resolveDshHome({ DSH_HOME: '~/custom-dsh' })).toBe(join(homedir(), 'custom-dsh'))
    expect(resolveCommunityMarketProfile({ DSH_HOME: '/tmp/deepdeck-dsh' })).toEqual({
      name: 'web',
      dir: '/tmp/deepdeck-dsh/profiles/web',
    })
  })

  it('keeps plugin add behind the protected install boundary', () => {
    const profile = { name: 'web', dir: '/tmp/deepdeck-dsh/profiles/web' }
    const pnpm = new DeepDeckCommunityMarketPnpm(
      profile,
      '/tmp/deepdeck-dsh',
      '/runtime/node',
      '/runtime/cli.js',
      '/tmp/deepdeck-dsh/deepdeck/recovery.json',
    )
    expect(() => pnpm.runPlugin(['add', 'unsafe-plugin'], profile.dir)).toThrow(
      'installs must use the protected install boundary',
    )
  })

  it('allows only the protected target to join the profile bundle list', () => {
    const before = JSON.stringify({
      dependencies: { stale: 'link:/stale' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
    const current = JSON.stringify({
      dependencies: {
        stale: 'link:/stale',
        '@fixture/reader': 'link:/reader',
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'stale',
            '@fixture/reader',
          ],
        },
      },
    })

    const restricted = restrictAddedProfileBundles(before, current, '@fixture/reader')
    expect(JSON.parse(String(restricted))).toMatchObject({
      dsh: {
        profile: {
          bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@fixture/reader'],
        },
      },
    })
  })

  it('commits an awaiting install when a new generation starts the next protected install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepdeck-install-recovery-'))
    const profile = { name: 'web', dir: join(root, 'profile') }
    const cliPath = join(root, 'cli.mjs')
    const statePath = join(root, 'deepdeck', 'recovery.json')
    await mkdir(profile.dir, { recursive: true })
    await writeFile(cliPath, '')
    await writeFile(join(profile.dir, 'package.json'), `${JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    })}\n`)

    try {
      const first = new DeepDeckCommunityMarketPnpm(
        profile,
        root,
        process.execPath,
        cliPath,
        statePath,
      )
      const firstHandle = await first.runPluginInstall(
        ['add', '@fixture/first'],
        profile.dir,
        { packageName: '@fixture/first', packageVersion: '1.0.0', receiptId: 'first-receipt' },
      )
      await expect(firstHandle.done).resolves.toEqual({ exitCode: 0, signal: null })
      await expect(readFile(statePath, 'utf8')).resolves.toContain('"phase":"awaiting-restart"')

      const second = new DeepDeckCommunityMarketPnpm(
        profile,
        root,
        process.execPath,
        cliPath,
        statePath,
      )
      const secondHandle = await second.runPluginInstall(
        ['add', '@fixture/second'],
        profile.dir,
        { packageName: '@fixture/second', packageVersion: '2.0.0', receiptId: 'second-receipt' },
      )
      await expect(secondHandle.done).resolves.toEqual({ exitCode: 0, signal: null })
      const current = JSON.parse(await readFile(statePath, 'utf8')) as { receiptId: string; phase: string }
      expect(current).toMatchObject({ receiptId: 'second-receipt', phase: 'awaiting-restart' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
