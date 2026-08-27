import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import {
  DeepDeckAppInstallPnpm,
  resolveAppInstallProfile,
  resolveDshHome,
} from './runtime.js'

declare const process: {
  readonly argv: readonly string[]
  readonly execPath: string
  readonly env: NodeJS.ProcessEnv
  readonly pid: number
  readonly send?: (message: MarketplaceDesktopMessage) => boolean
  on?(event: 'message', listener: (message: unknown) => void): void
  off?(event: 'message', listener: (message: unknown) => void): void
}

interface HostContext {
  effect(setup: () => (() => void), label?: string): void
  reflect: {
    provide(name: string, value: unknown): () => void
  }
}

export const name = 'deepdeck-app-market-desktop-bridge'
export const MARKETPLACE_RESTART_REQUEST = 'dsh-market:restart' as const
export const APP_WINDOWS_RELOAD_REQUEST = 'deepdeck:reload-app-windows' as const
export const APP_WINDOWS_RELOAD_RESULT = 'deepdeck:reload-app-windows-result' as const

export type MarketplaceDesktopMessage =
  | { readonly type: typeof MARKETPLACE_RESTART_REQUEST }
  | { readonly type: typeof APP_WINDOWS_RELOAD_REQUEST; readonly requestId: string; readonly path: string }

export interface AppWindowsReloadResponse {
  readonly type: typeof APP_WINDOWS_RELOAD_RESULT
  readonly requestId: string
  readonly matched: number
  readonly reloaded: number
  readonly failed: number
  readonly error?: string
}

export interface AppWindowReloadReceipt {
  readonly matched: number
  readonly reloaded: number
  readonly failed: number
}

type SendToDesktop = (message: MarketplaceDesktopMessage) => boolean

export interface MarketplaceRestartService {
  schedule(): {
    readonly pid: number
    readonly helperPid: undefined
    readonly logOut: string
    readonly logErr: string
  }
}

/** Compatibility surface for the previous dshmarket bridge and its consumers. */
export function createMarketplaceRestartService(
  send: ((message: { readonly type: typeof MARKETPLACE_RESTART_REQUEST }) => boolean) | null | undefined,
  defer: (callback: () => void, delay: number) => unknown = setTimeout,
): MarketplaceRestartService {
  return {
    schedule: () => {
      if (send == null) throw new Error('DeepDeck restart requires a Node IPC parent')
      defer(() => { send({ type: MARKETPLACE_RESTART_REQUEST }) }, 100)
      return { pid: process.pid, helperPid: undefined, logOut: '', logErr: '' }
    },
  }
}

export interface MarketplaceDesktopServicesOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly nodeBinary?: string
  readonly cliPath?: string
  readonly send?: SendToDesktop
  readonly defer?: (callback: () => void, delay: number) => unknown
  readonly subscribe?: (listener: (message: unknown) => void) => () => void
}

export function createMarketplaceDesktopServices(
  options: MarketplaceDesktopServicesOptions = {},
): Readonly<Record<'desktopProfiles' | 'desktopPnpm' | 'desktopActions', unknown>> {
  const environment = options.environment ?? process.env
  const homeDir = resolveDshHome(environment)
  const profile = resolveAppInstallProfile(environment)
  const cliPath = options.cliPath ?? process.argv[1]
  if (cliPath === undefined || !isAbsolute(cliPath)) {
    throw new Error('DeepDeck could not resolve the Harness CLI for App installs')
  }
  const send = options.send ?? process.send?.bind(process)
  const defer = options.defer ?? setTimeout
  const subscribe = options.subscribe ?? ((listener: (message: unknown) => void) => {
    if (process.on === undefined || process.off === undefined) {
      throw new Error('DeepDeck App window reload requires a desktop IPC receiver')
    }
    process.on('message', listener)
    return () => { process.off?.('message', listener) }
  })
  let restartRequested = false
  return Object.freeze({
    desktopProfiles: Object.freeze({ current: profile }),
    desktopPnpm: new DeepDeckAppInstallPnpm(
      profile,
      homeDir,
      options.nodeBinary ?? process.execPath,
      cliPath,
      join(homeDir, 'deepdeck', 'community-market-install-recovery.json'),
    ),
    desktopActions: Object.freeze({
      requestRestart: async (): Promise<void> => {
        if (restartRequested) return
        if (send === undefined) throw new Error('DeepDeck restart requires a desktop IPC parent')
        restartRequested = true
        defer(() => { send({ type: MARKETPLACE_RESTART_REQUEST }) }, 100)
      },
      reloadAppWindows: async (path: string): Promise<AppWindowReloadReceipt> => {
        if (send === undefined) throw new Error('DeepDeck App window reload requires a desktop IPC parent')
        const requestId = randomUUID()
        return await new Promise<AppWindowReloadReceipt>((resolve, reject) => {
          let settled = false
          let stop = (): void => {}
          let timeout: ReturnType<typeof setTimeout> | undefined
          const finish = (error: Error | undefined, receipt?: AppWindowReloadReceipt): void => {
            if (settled) return
            settled = true
            if (timeout !== undefined) clearTimeout(timeout)
            stop()
            if (error === undefined && receipt !== undefined) resolve(receipt)
            else reject(error)
          }
          stop = subscribe((message) => {
            if (typeof message !== 'object' || message === null) return
            const result = message as Partial<AppWindowsReloadResponse>
            if (result.type !== APP_WINDOWS_RELOAD_RESULT || result.requestId !== requestId) return
            if (typeof result.error === 'string') finish(new Error(result.error))
            else if (
              typeof result.matched === 'number' && Number.isSafeInteger(result.matched) && result.matched >= 0
              && typeof result.reloaded === 'number' && Number.isSafeInteger(result.reloaded) && result.reloaded >= 0
              && typeof result.failed === 'number' && Number.isSafeInteger(result.failed) && result.failed >= 0
              && result.reloaded + result.failed === result.matched
            ) {
              finish(undefined, Object.freeze({
                matched: result.matched,
                reloaded: result.reloaded,
                failed: result.failed,
              }))
            } else finish(new Error('DeepDeck returned an invalid App window reload result'))
          })
          timeout = setTimeout(() => finish(new Error('DeepDeck App window reload timed out')), 20_000)
          if (!send({ type: APP_WINDOWS_RELOAD_REQUEST, requestId, path })) {
            finish(new Error('DeepDeck could not send the App window reload request'))
          }
        })
      },
    }),
  })
}

/** Provide the Desktop capabilities consumed by the Apps installer and builder. */
export function apply(ctx: HostContext): void {
  const services = createMarketplaceDesktopServices()
  ctx.effect(() => {
    const dispose = Object.entries(services).map(([serviceName, service]) => (
      ctx.reflect.provide(serviceName, service)
    ))
    return () => {
      for (const release of dispose.reverse()) release()
    }
  }, 'deepdeck app market: desktop capabilities')
}
