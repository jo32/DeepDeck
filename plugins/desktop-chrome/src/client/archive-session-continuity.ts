import type {
  ObservableSnapshot,
  SessionId,
  WorkspaceId,
} from '@deepseek-ai/dsh-client-runtime/client'

interface SessionSelectionSnapshot {
  readonly current: SessionId | undefined
}

interface WorkspaceArchiveSnapshot {
  readonly archivedSessionIds: readonly SessionId[]
  readonly items: readonly {
    readonly workspaceId: WorkspaceId
    readonly sessionIds: readonly SessionId[]
  }[]
}

export interface ArchiveSessionContinuityRuntime {
  readonly sessions: {
    readonly list: ObservableSnapshot<SessionSelectionSnapshot>
  }
  readonly workspaces: {
    readonly list: ObservableSnapshot<WorkspaceArchiveSnapshot>
    startSession: (workspaceId?: WorkspaceId) => void
  }
}

/**
 * Turn the upstream archived-current clear into DeepDeck's normal New Session
 * flow. The Workspace projection is the synchronization point: it publishes
 * only after the archived id has cleared the Session selection, while keeping
 * the archived Session in its Workspace account.
 */
export function installArchiveSessionContinuity(
  runtime: ArchiveSessionContinuityRuntime,
): () => void {
  let previousCurrent = runtime.sessions.list.getSnapshot().current

  return runtime.workspaces.list.subscribe(() => {
    const workspaces = runtime.workspaces.list.getSnapshot()
    const current = runtime.sessions.list.getSnapshot().current
    const archivedCurrent = previousCurrent !== undefined
      && current === undefined
      && workspaces.archivedSessionIds.includes(previousCurrent)

    const archivedSessionId = archivedCurrent ? previousCurrent : undefined
    previousCurrent = current
    if (archivedSessionId === undefined) return

    const workspaceId = workspaces.items.find(workspace =>
      workspace.sessionIds.includes(archivedSessionId))?.workspaceId
    runtime.workspaces.startSession(workspaceId)
  })
}
