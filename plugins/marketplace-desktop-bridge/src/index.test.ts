import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST,
  COMMUNITY_MARKET_RESTART_REQUEST,
  createCommunityMarketDesktopServices,
  type CommunityMarketDesktopMessage,
} from './index.js'

describe('createCommunityMarketDesktopServices', () => {
  it('provides the upstream market desktop contract for the web profile', async () => {
    const messages: CommunityMarketDesktopMessage[] = []
    const deferred: Array<() => void> = []
    const services = createCommunityMarketDesktopServices({
      environment: { DSH_HOME: '/tmp/deepdeck-market-test' },
      nodeBinary: '/runtime/node',
      cliPath: '/runtime/cli.js',
      send: (message) => {
        messages.push(message)
        return true
      },
      defer: (callback) => deferred.push(callback),
    }) as {
      desktopProfiles: { current: { name: string; dir: string } }
      desktopActions: { openTerminal(): void; requestRestart(): Promise<void> }
    }

    expect(services.desktopProfiles.current).toEqual({
      name: 'web',
      dir: '/tmp/deepdeck-market-test/profiles/web',
    })

    services.desktopActions.openTerminal()
    await services.desktopActions.requestRestart()
    await services.desktopActions.requestRestart()
    expect(messages).toEqual([{ type: COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST }])
    expect(deferred).toHaveLength(1)

    deferred[0]?.()
    expect(messages).toEqual([
      { type: COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST },
      { type: COMMUNITY_MARKET_RESTART_REQUEST },
    ])
  })

  it('requires an absolute Harness CLI path', () => {
    expect(() => createCommunityMarketDesktopServices({
      environment: { DSH_HOME: '/tmp/deepdeck-market-test' },
      cliPath: 'relative/cli.js',
    })).toThrow('could not resolve the Harness CLI')
  })
})
