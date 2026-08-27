import { describe, expect, it } from 'vitest'
import {
  APP_WINDOWS_RELOAD_REQUEST,
  APP_WINDOWS_RELOAD_RESULT,
  createMarketplaceDesktopServices,
  MARKETPLACE_RESTART_REQUEST,
  type MarketplaceDesktopMessage,
} from './index.js'

describe('createMarketplaceDesktopServices', () => {
  it('provides the Apps installer desktop contract for the web profile', async () => {
    const messages: MarketplaceDesktopMessage[] = []
    const deferred: Array<() => void> = []
    let receive: ((message: unknown) => void) | undefined
    const services = createMarketplaceDesktopServices({
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
        requestRestart(): Promise<void>
        reloadAppWindows(path: string): Promise<{ matched: number; reloaded: number; failed: number }>
      }
    }

    expect(services.desktopProfiles.current).toEqual({
      name: 'web',
      dir: '/tmp/deepdeck-market-test/profiles/web',
    })

    await expect(services.desktopActions.reloadAppWindows('/apps/reader')).resolves.toEqual({
      matched: 3,
      reloaded: 2,
      failed: 1,
    })
    await services.desktopActions.requestRestart()
    await services.desktopActions.requestRestart()
    expect(messages).toEqual([
      { type: APP_WINDOWS_RELOAD_REQUEST, requestId: expect.any(String), path: '/apps/reader' },
    ])
    expect(deferred).toHaveLength(1)

    deferred[0]?.()
    expect(messages).toEqual([
      { type: APP_WINDOWS_RELOAD_REQUEST, requestId: expect.any(String), path: '/apps/reader' },
      { type: MARKETPLACE_RESTART_REQUEST },
    ])
  })

  it('requires an absolute Harness CLI path', () => {
    expect(() => createMarketplaceDesktopServices({
      environment: { DSH_HOME: '/tmp/deepdeck-market-test' },
      cliPath: 'relative/cli.js',
    })).toThrow('could not resolve the Harness CLI')
  })
})
