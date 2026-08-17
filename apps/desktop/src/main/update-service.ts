import type { DesktopUpdateStatus } from "../shared/update.js";

export interface UpdateVersionInfo {
  version: string;
}

export interface UpdateProgressInfo {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateDriverEvents {
  error: (error: Error) => void;
  "checking-for-update": () => void;
  "update-not-available": (info: UpdateVersionInfo) => void;
  "update-available": (info: UpdateVersionInfo) => void;
  "download-progress": (info: UpdateProgressInfo) => void;
  "update-downloaded": (info: UpdateVersionInfo) => void;
}

export interface UpdateDriver {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  disableWebInstaller: boolean;
  disableDifferentialDownload: boolean;
  on<K extends keyof UpdateDriverEvents>(event: K, listener: UpdateDriverEvents[K]): unknown;
  removeListener<K extends keyof UpdateDriverEvents>(
    event: K,
    listener: UpdateDriverEvents[K],
  ): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<readonly string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

type StatusListener = (status: DesktopUpdateStatus) => void;

export interface DesktopUpdateServiceOptions {
  currentVersion: string;
  enabled: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function progressPercent(value: number): number {
  return Math.min(100, finiteNonNegative(value));
}

export class DesktopUpdateService {
  private status: DesktopUpdateStatus;
  private readonly listeners = new Set<StatusListener>();
  private readonly removeDriverListeners: Array<() => void> = [];

  constructor(
    private readonly driver: UpdateDriver,
    private readonly options: DesktopUpdateServiceOptions,
  ) {
    this.status = { state: "idle", currentVersion: options.currentVersion };
    driver.autoDownload = false;
    driver.autoInstallOnAppQuit = true;
    driver.disableWebInstaller = true;
    driver.disableDifferentialDownload = false;

    this.listen("checking-for-update", () => {
      this.publish({ state: "checking", currentVersion: options.currentVersion });
    });
    this.listen("update-not-available", () => {
      this.publish({ state: "idle", currentVersion: options.currentVersion });
    });
    this.listen("update-available", (info) => {
      this.publish({
        state: "available",
        currentVersion: options.currentVersion,
        version: info.version,
      });
    });
    this.listen("download-progress", (info) => {
      const version = this.status.version;
      if (!version) return;
      this.publish({
        state: "downloading",
        currentVersion: options.currentVersion,
        version,
        percent: progressPercent(info.percent),
        transferred: finiteNonNegative(info.transferred),
        total: finiteNonNegative(info.total),
        bytesPerSecond: finiteNonNegative(info.bytesPerSecond),
      });
    });
    this.listen("update-downloaded", (info) => {
      this.publish({
        state: "downloaded",
        currentVersion: options.currentVersion,
        version: info.version,
        percent: 100,
      });
    });
    this.listen("error", (error) => {
      this.fail(error);
    });
  }

  getStatus(): DesktopUpdateStatus {
    return { ...this.status };
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  async check(): Promise<DesktopUpdateStatus> {
    if (!this.options.enabled) return this.getStatus();
    this.publish({ state: "checking", currentVersion: this.options.currentVersion });
    try {
      await this.driver.checkForUpdates();
    } catch (error) {
      this.fail(error);
    }
    return this.getStatus();
  }

  async download(): Promise<DesktopUpdateStatus> {
    const version = this.status.version;
    const canDownload = this.status.state === "available" || this.status.state === "error";
    if (!this.options.enabled || !version || !canDownload) return this.getStatus();

    this.publish({
      state: "downloading",
      currentVersion: this.options.currentVersion,
      version,
      percent: 0,
    });
    try {
      await this.driver.downloadUpdate();
    } catch (error) {
      this.fail(error);
    }
    return this.getStatus();
  }

  quitAndInstall(): void {
    if (!this.options.enabled || this.status.state !== "downloaded") return;
    this.driver.quitAndInstall(false, true);
  }

  dispose(): void {
    for (const remove of this.removeDriverListeners.splice(0)) remove();
    this.listeners.clear();
  }

  private listen<K extends keyof UpdateDriverEvents>(
    event: K,
    listener: UpdateDriverEvents[K],
  ): void {
    this.driver.on(event, listener);
    this.removeDriverListeners.push(() => {
      this.driver.removeListener(event, listener);
    });
  }

  private fail(error: unknown): void {
    const version = this.status.version;
    this.publish({
      state: "error",
      currentVersion: this.options.currentVersion,
      ...(version ? { version } : {}),
      message: errorMessage(error),
    });
  }

  private publish(status: DesktopUpdateStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(this.getStatus());
  }
}
