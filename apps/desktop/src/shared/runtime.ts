import type { DesktopBranding } from "./branding.js";
import type { DesktopAppearanceApi } from "./theme.js";
import type { DesktopUpdatesApi } from "./update.js";

export type HarnessRuntimeState =
  | "idle"
  | "starting"
  | "ready"
  | "stopping"
  | "error";

export interface HarnessRuntimeStatus {
  state: HarnessRuntimeState;
  message: string;
  url?: string;
  details?: string;
}

/** One Session that was live when a user-approved Harness restart began. */
export interface DesktopRestartSession {
  sessionId: string;
  /** Pending user interactions are restored cold; ordinary work gets a queued continuation. */
  continuation: boolean;
}

/** User-visible restart request emitted only after the triggering Agent turn is durable. */
export interface DesktopRestartRequest {
  requestId: string;
  openAppCount: number;
}

/** Renderer decision plus the exact live Session snapshot taken at confirmation time. */
export interface DesktopRestartDecision {
  requestId: string;
  confirmed: boolean;
  sessions: DesktopRestartSession[];
}

/** Recovery work retained by Electron across one Harness process replacement. */
export interface DesktopRestartRecovery {
  recoveryId: string;
  sessions: DesktopRestartSession[];
}

export type DesktopTelemetryScreen = "home" | "apps";

export interface DesktopApi {
  appearance: DesktopAppearanceApi;
  branding: {
    get(): Promise<DesktopBranding>;
  };
  runtime: {
    get(): Promise<HarnessRuntimeStatus>;
    restart(): Promise<HarnessRuntimeStatus>;
    readyForDisplay(): void;
    onStatus(listener: (status: HarnessRuntimeStatus) => void): () => void;
    pendingRestart(): Promise<DesktopRestartRequest | undefined>;
    decideRestart(decision: DesktopRestartDecision): Promise<boolean>;
    onRestartRequested(listener: (request: DesktopRestartRequest) => void): () => void;
    restartRecovery(): Promise<DesktopRestartRecovery | undefined>;
    acknowledgeRestartRecovery(recoveryId: string, sessionIds: string[]): Promise<boolean>;
  };
  telemetry: {
    screen(name: DesktopTelemetryScreen): Promise<boolean>;
  };
  updates: DesktopUpdatesApi;
}
