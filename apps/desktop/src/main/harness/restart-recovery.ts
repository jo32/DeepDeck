import { randomUUID } from "node:crypto";
import type {
  DesktopRestartDecision,
  DesktopRestartRecovery,
  DesktopRestartRequest,
  DesktopRestartSession,
} from "../../shared/runtime.js";

interface PendingRestart {
  request: DesktopRestartRequest;
  appRoutes: string[];
}

interface ActiveRecovery {
  recovery: DesktopRestartRecovery;
  appRoutes: string[];
  appsRestored: boolean;
}

export type RestartDecisionResult = "ignored" | "cancelled" | "confirmed";

function validSessions(value: unknown): value is DesktopRestartSession[] {
  if (!Array.isArray(value) || value.length > 1_000) return false;
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return false;
    const session = entry as Partial<DesktopRestartSession>;
    if (
      typeof session.sessionId !== "string"
      || session.sessionId.length === 0
      || session.sessionId.length > 512
      || typeof session.continuation !== "boolean"
      || ids.has(session.sessionId)
    ) return false;
    ids.add(session.sessionId);
  }
  return true;
}

/** In-memory transaction that survives replacing the Harness child, not the desktop process. */
export class HarnessRestartRecovery {
  private pending: PendingRestart | undefined;
  private active: ActiveRecovery | undefined;

  constructor(private readonly createId: () => string = randomUUID) {}

  request(appRoutes: readonly string[]): DesktopRestartRequest | undefined {
    if (this.pending !== undefined || this.active !== undefined) return undefined;
    const request = Object.freeze({
      requestId: this.createId(),
      openAppCount: appRoutes.length,
    });
    this.pending = { request, appRoutes: [...appRoutes] };
    return request;
  }

  pendingRequest(): DesktopRestartRequest | undefined {
    return this.pending?.request;
  }

  decide(value: unknown, appRoutes?: readonly string[]): RestartDecisionResult {
    if (typeof value !== "object" || value === null || this.pending === undefined) return "ignored";
    const decision = value as Partial<DesktopRestartDecision>;
    if (
      decision.requestId !== this.pending.request.requestId
      || typeof decision.confirmed !== "boolean"
      || !validSessions(decision.sessions)
    ) return "ignored";

    const pending = this.pending;
    this.pending = undefined;
    if (!decision.confirmed) return "cancelled";

    this.active = {
      recovery: Object.freeze({
        recoveryId: decision.requestId,
        sessions: decision.sessions.map(session => Object.freeze({ ...session })),
      }),
      appRoutes: [...(appRoutes ?? pending.appRoutes)],
      appsRestored: (appRoutes ?? pending.appRoutes).length === 0,
    };
    this.clearIfComplete();
    return "confirmed";
  }

  recovery(): DesktopRestartRecovery | undefined {
    return this.active?.recovery;
  }

  appRoutes(): readonly string[] {
    return this.active?.appRoutes ?? [];
  }

  markAppsRestored(): void {
    if (this.active === undefined) return;
    this.active.appsRestored = true;
    this.clearIfComplete();
  }

  acknowledge(recoveryId: unknown, sessionIds: unknown): boolean {
    if (
      this.active === undefined
      || recoveryId !== this.active.recovery.recoveryId
      || !Array.isArray(sessionIds)
      || sessionIds.some(id => typeof id !== "string")
    ) return false;
    const acknowledged = new Set(sessionIds as string[]);
    this.active.recovery = Object.freeze({
      ...this.active.recovery,
      sessions: this.active.recovery.sessions.filter(session => !acknowledged.has(session.sessionId)),
    });
    this.clearIfComplete();
    return true;
  }

  private clearIfComplete(): void {
    if (this.active?.appsRestored === true && this.active.recovery.sessions.length === 0) {
      this.active = undefined;
    }
  }
}
