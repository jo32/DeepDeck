import { describe, expect, it } from 'vitest'
import {
  APP_WINDOWS_RELOAD_REQUEST,
  APP_WINDOWS_RELOAD_RESULT,
  COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST,
  COMMUNITY_MARKET_RESTART_REQUEST,
  createCommunityMarketDesktopServices,
  type CommunityMarketDesktopMessage,
} from './index.js'

describe('createCommunityMarketDesktopServices', () => {
  it('provides the upstream market desktop contract for the web profile', async () => {
    const messages: CommunityMarketDesktopMessage[] = []
    const deferred: Array<() => void> = []
    let receive: ((message: unknown) => void) | undefined
    const services = createCommunityMarketDesktopServices({
      environment: { DSH_HOME: '/tmp/deepdeck-market-test' },
      nodeBinary: '/runtime/node',
      cliPath: '/runtime/cli.js',
      send: (message) => {
        messages.push(message)
        if (message.type === APP_WINDOWS_RELOAD_REQUEST) {
          receive?.({
            type: APP_WINDOWS_RELOAD_RESULT,
            requestId: message.requestId,
            matched: 3,
            reloaded: 2,
            failed: 1,
          })
        }
        return true
      },
      defer: (callback) => deferred.push(callback),
      subscribe: (listener) => {
        receive = listener
        return () => { receive = undefined }
      },
    }) as {
      desktopProfiles: { current: { name: string; dir: string } }
      desktopActions: {
        openTerminal(): void
        requestRestart(): Promise<void>
        reloadAppWindows(path: string): Promise<{ matched: number; reloaded: number; failed: number }>
      }
    }

    expect(services.desktopProfiles.current).toEqual({
      name: 'web',
      dir: '/tmp/deepdeck-market-test/profiles/web',
    })

    services.desktopActions.openTerminal()
    await expect(services.desktopActions.reloadAppWindows('/apps/reader')).resolves.toEqual({
      matched: 3,
      reloaded: 2,
      failed: 1,
    })
    await services.desktopActions.requestRestart()
    await services.desktopActions.requestRestart()
    expect(messages).toEqual([
      { type: COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST },
      { type: APP_WINDOWS_RELOAD_REQUEST, requestId: expect.any(String), path: '/apps/reader' },
    ])
    expect(deferred).toHaveLength(1)

    deferred[0]?.()
    expect(messages).toEqual([
      { type: COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST },
      { type: APP_WINDOWS_RELOAD_REQUEST, requestId: expect.any(String), path: '/apps/reader' },
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
