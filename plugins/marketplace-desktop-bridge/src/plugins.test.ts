import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeepDeckCommunityMarketPlugins } from './plugins.js'

function profileWithBundles(bundles: unknown): string {
  const profileDir = join(mkdtempSync(join(tmpdir(), 'deepdeck-market-')), 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles } },
  }))
  return profileDir
}

describe('DeepDeckCommunityMarketPlugins', () => {
  it('exposes current profile bundles without unsupported disable controls', () => {
    const plugins = new DeepDeckCommunityMarketPlugins(profileWithBundles([
      '@deepdeck/example',
      'dsh-community-market',
    ]))

    const first = plugins.list()
    const second = plugins.list()
    expect(first.map(({ packageName, status, mutable }) => ({ packageName, status, mutable }))).toEqual([
      { packageName: '@deepdeck/example', status: 'active', mutable: false },
      { packageName: 'dsh-community-market', status: 'active', mutable: false },
    ])
    expect(second.map(({ bundleId }) => bundleId)).toEqual(first.map(({ bundleId }) => bundleId))
  })

  it('rejects malformed bundle names from the active profile', () => {
    const plugins = new DeepDeckCommunityMarketPlugins(profileWithBundles(['valid-plugin', '../escape']))
    expect(() => plugins.list()).toThrow('profile bundle list is invalid')
  })
})
