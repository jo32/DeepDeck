import { isAbsolute, join } from 'node:path'
import { DeepDeckCommunityMarketPlugins } from './plugins.js'
import {
  DeepDeckCommunityMarketPnpm,
  resolveCommunityMarketProfile,
  resolveDshHome,
} from './runtime.js'

declare const process: {
  readonly argv: readonly string[]
  readonly execPath: string
  readonly env: NodeJS.ProcessEnv
  readonly pid: number
  readonly send?: (message: CommunityMarketDesktopMessage) => boolean
}

interface HostContext {
  effect(setup: () => (() => void), label?: string): void
  reflect: {
    provide(name: string, value: unknown): () => void
  }
}

export const name = 'deepdeck-community-market-desktop-bridge'
export const MARKETPLACE_RESTART_REQUEST = 'dsh-market:restart' as const
export const COMMUNITY_MARKET_RESTART_REQUEST = 'dsh-community-market:restart' as const
export const COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST = 'dsh-community-market:open-terminal' as const

export type CommunityMarketDesktopMessage =
  | { readonly type: typeof COMMUNITY_MARKET_RESTART_REQUEST }
  | { readonly type: typeof COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST }

type SendToDesktop = (message: CommunityMarketDesktopMessage) => boolean

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

export interface CommunityMarketDesktopServicesOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly nodeBinary?: string
  readonly cliPath?: string
  readonly send?: SendToDesktop
  readonly defer?: (callback: () => void, delay: number) => unknown
}

export function createCommunityMarketDesktopServices(
  options: CommunityMarketDesktopServicesOptions = {},
): Readonly<Record<'desktopProfiles' | 'desktopPnpm' | 'desktopPlugins' | 'desktopActions', unknown>> {
  const environment = options.environment ?? process.env
  const homeDir = resolveDshHome(environment)
  const profile = resolveCommunityMarketProfile(environment)
  const cliPath = options.cliPath ?? process.argv[1]
  if (cliPath === undefined || !isAbsolute(cliPath)) {
    throw new Error('DeepDeck could not resolve the Harness CLI for Community Market')
  }
  const send = options.send ?? process.send?.bind(process)
  const defer = options.defer ?? setTimeout
  let restartRequested = false
  return Object.freeze({
    desktopProfiles: Object.freeze({ current: profile }),
    desktopPnpm: new DeepDeckCommunityMarketPnpm(
      profile,
      homeDir,
      options.nodeBinary ?? process.execPath,
      cliPath,
      join(homeDir, 'deepdeck', 'community-market-install-recovery.json'),
    ),
    desktopPlugins: new DeepDeckCommunityMarketPlugins(profile.dir),
    desktopActions: Object.freeze({
      openTerminal: (): void => {
        if (send === undefined) throw new Error('DeepDeck terminal requires a desktop IPC parent')
        send({ type: COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST })
      },
      requestRestart: async (): Promise<void> => {
        if (restartRequested) return
        if (send === undefined) throw new Error('DeepDeck restart requires a desktop IPC parent')
        restartRequested = true
        defer(() => { send({ type: COMMUNITY_MARKET_RESTART_REQUEST }) }, 100)
      },
    }),
  })
}

/** Provide the Desktop capabilities consumed by the upstream Community Market. */
export function apply(ctx: HostContext): void {
  const services = createCommunityMarketDesktopServices()
  ctx.effect(() => {
    const dispose = Object.entries(services).map(([serviceName, service]) => (
      ctx.reflect.provide(serviceName, service)
    ))
    return () => {
      for (const release of dispose.reverse()) release()
    }
  }, 'deepdeck community market: desktop capabilities')
}
