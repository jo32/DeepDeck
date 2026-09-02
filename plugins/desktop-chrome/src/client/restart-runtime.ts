export interface RestartSessionSnapshot {
  readonly sessionId: string
  readonly continuation: boolean
}

export interface RestartRequestSnapshot {
  readonly requestId: string
  readonly openAppCount: number
}

export interface RestartRecoverySnapshot {
  readonly recoveryId: string
  readonly sessions: readonly RestartSessionSnapshot[]
}

export interface DesktopRestartBridge {
  pendingRestart: () => Promise<RestartRequestSnapshot | undefined>
  decideRestart: (decision: {
    readonly requestId: string
    readonly confirmed: boolean
    readonly sessions: readonly RestartSessionSnapshot[]
  }) => Promise<boolean>
  onRestartRequested: (listener: (request: RestartRequestSnapshot) => void) => () => void
  restartRecovery: () => Promise<RestartRecoverySnapshot | undefined>
  acknowledgeRestartRecovery: (recoveryId: string, sessionIds: readonly string[]) => Promise<boolean>
}

export function desktopRestartBridge(): DesktopRestartBridge | undefined {
  const desktopWindow = window as Window & {
    deepseekDesktop?: { runtime?: Partial<DesktopRestartBridge> }
  }
  const runtime = desktopWindow.deepseekDesktop?.runtime
  if (
    runtime?.pendingRestart === undefined
    || runtime.decideRestart === undefined
    || runtime.onRestartRequested === undefined
    || runtime.restartRecovery === undefined
    || runtime.acknowledgeRestartRecovery === undefined
  ) return undefined
  return runtime as DesktopRestartBridge
}
