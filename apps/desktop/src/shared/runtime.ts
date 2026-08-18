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
  };
  updates: DesktopUpdatesApi;
}
