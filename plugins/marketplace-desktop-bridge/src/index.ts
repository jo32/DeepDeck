declare const process: {
  readonly pid: number
  readonly send?: (message: MarketplaceRestartMessage) => boolean
}

interface HostContext {
  effect(setup: () => (() => void), label?: string): void
  reflect: {
    provide(name: string, value: unknown): () => void
  }
}

export const name = 'deepdeck-marketplace-desktop-bridge'
export const MARKETPLACE_RESTART_REQUEST = 'dsh-market:restart' as const

export interface MarketplaceRestartMessage {
  type: typeof MARKETPLACE_RESTART_REQUEST
}

export interface MarketplaceRestartResult {
  pid: number
  helperPid: undefined
  logOut: string
  logErr: string
}

export interface MarketplaceRestartService {
  schedule(): MarketplaceRestartResult
}

type SendToDesktop = (message: MarketplaceRestartMessage) => boolean

export function createMarketplaceRestartService(
  send: SendToDesktop | null | undefined,
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

/** Provide the host-lifecycle adapter consumed by dshmarket when it mounts next. */
export function apply(ctx: HostContext): void {
  const send = process.send?.bind(process) as SendToDesktop | undefined
  const service = createMarketplaceRestartService(send)
  ctx.effect(
    () => ctx.reflect.provide('dshMarketRestart', service),
    'deepdeck marketplace: supervised Harness restart',
  )
}
