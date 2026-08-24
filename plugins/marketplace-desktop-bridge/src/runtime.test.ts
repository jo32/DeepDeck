import { homedir } from 'node:os'
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
})
