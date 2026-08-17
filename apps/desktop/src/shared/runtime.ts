import type { DesktopBranding } from "./branding.js";

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

export interface DesktopApi {
  branding: {
    get(): Promise<DesktopBranding>;
  };
  runtime: {
    get(): Promise<HarnessRuntimeStatus>;
    restart(): Promise<HarnessRuntimeStatus>;
    onStatus(listener: (status: HarnessRuntimeStatus) => void): () => void;
  };
}
