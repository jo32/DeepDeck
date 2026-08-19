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
  initialStatus?: DesktopUpdateStatus;
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
  private refreshBeforeDownload: boolean;
  private readonly listeners = new Set<StatusListener>();
  private readonly removeDriverListeners: Array<() => void> = [];

  constructor(
    private readonly driver: UpdateDriver,
    private readonly options: DesktopUpdateServiceOptions,
  ) {
    this.status = options.initialStatus
      ? { ...options.initialStatus }
      : { state: "idle", currentVersion: options.currentVersion };
    this.refreshBeforeDownload = options.initialStatus?.state === "error";
    driver.autoDownload = false;
    // A downloaded update must remain inert until the user explicitly chooses
    // Restart and update; normal app quits must never bypass the native helper.
    driver.autoInstallOnAppQuit = false;
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
    const version = this.status.version;
    this.publish({
      state: "checking",
      currentVersion: this.options.currentVersion,
      ...(version ? { version } : {}),
    });
    try {
      await this.driver.checkForUpdates();
    } catch (error) {
      this.fail(error);
    }
    return this.getStatus();
  }

  async download(): Promise<DesktopUpdateStatus> {
    if (!this.options.enabled) return this.getStatus();
    if (this.status.state === "error" && this.refreshBeforeDownload) {
      this.refreshBeforeDownload = false;
      const refreshed = await this.check();
      if (refreshed.state !== "available") return refreshed;
    }

    const version = this.status.version;
    const canDownload = this.status.state === "available" || this.status.state === "error";
    if (!version || !canDownload) return this.getStatus();

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

  markInstalling(): DesktopUpdateStatus {
    if (this.status.state !== "downloaded" || !this.status.version) return this.getStatus();
    this.publish({
      state: "installing",
      currentVersion: this.options.currentVersion,
      version: this.status.version,
      percent: 100,
    });
    return this.getStatus();
  }

  reportInstallFailure(error: unknown, version?: string): DesktopUpdateStatus {
    this.publish({
      state: "error",
      currentVersion: this.options.currentVersion,
      ...(version ? { version } : {}),
      message: errorMessage(error),
    });
    this.refreshBeforeDownload = true;
    return this.getStatus();
  }

  quitAndInstall(): void {
    if (
      !this.options.enabled
      || (this.status.state !== "downloaded" && this.status.state !== "installing")
    ) return;
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
