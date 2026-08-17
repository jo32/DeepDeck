export type DesktopUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface DesktopUpdateStatus {
  state: DesktopUpdateState;
  currentVersion: string;
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
}

export interface DesktopUpdatesApi {
  get(): Promise<DesktopUpdateStatus>;
  download(): Promise<DesktopUpdateStatus>;
  onStatus(listener: (status: DesktopUpdateStatus) => void): () => void;
}
