import { describe, expect, it, vi } from "vitest";
import {
  DesktopUpdateService,
  type UpdateDriver,
  type UpdateDriverEvents,
} from "./update-service.js";

class FakeUpdateDriver implements UpdateDriver {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  disableWebInstaller = false;
  disableDifferentialDownload = true;
  readonly checkForUpdates = vi.fn(async (): Promise<unknown> => undefined);
  readonly downloadUpdate = vi.fn(async (): Promise<readonly string[]> => []);
  readonly quitAndInstall = vi.fn();
  private readonly listeners = new Map<keyof UpdateDriverEvents, Set<(...args: never[]) => void>>();

  on<K extends keyof UpdateDriverEvents>(event: K, listener: UpdateDriverEvents[K]): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (...args: never[]) => void);
    this.listeners.set(event, listeners);
  }

  removeListener<K extends keyof UpdateDriverEvents>(event: K, listener: UpdateDriverEvents[K]): void {
    this.listeners.get(event)?.delete(listener as (...args: never[]) => void);
  }

  emit<K extends keyof UpdateDriverEvents>(
    event: K,
    ...args: Parameters<UpdateDriverEvents[K]>
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args as never[]);
    }
  }
}

describe("DesktopUpdateService", () => {
  it("checks manually and exposes an available update without auto-downloading", async () => {
    const driver = new FakeUpdateDriver();
    const service = new DesktopUpdateService(driver, {
      currentVersion: "1.0.0",
      enabled: true,
    });

    expect(driver.autoDownload).toBe(false);
    expect(driver.autoInstallOnAppQuit).toBe(false);
    expect(driver.disableWebInstaller).toBe(true);
    expect(driver.disableDifferentialDownload).toBe(false);

    await service.check();
    expect(driver.checkForUpdates).toHaveBeenCalledOnce();
    driver.emit("update-available", { version: "1.1.0" });
    expect(service.getStatus()).toEqual({
      state: "available",
      currentVersion: "1.0.0",
      version: "1.1.0",
    });
  });

  it("publishes differential download progress and the ready state", async () => {
    const driver = new FakeUpdateDriver();
    const service = new DesktopUpdateService(driver, {
      currentVersion: "1.0.0",
      enabled: true,
    });
    driver.emit("update-available", { version: "1.1.0" });

    await service.download();
    driver.emit("download-progress", {
      percent: 42.4,
      transferred: 424,
      total: 1_000,
      bytesPerSecond: 212,
    });
    expect(service.getStatus()).toMatchObject({
      state: "downloading",
      version: "1.1.0",
      percent: 42.4,
      transferred: 424,
      total: 1_000,
    });

    driver.emit("update-downloaded", { version: "1.1.0" });
    expect(service.getStatus()).toMatchObject({
      state: "downloaded",
      version: "1.1.0",
      percent: 100,
    });
    service.markInstalling();
    expect(service.getStatus()).toMatchObject({
      state: "installing",
      version: "1.1.0",
    });
    service.quitAndInstall();
    expect(driver.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("refreshes the update feed before retrying a failed installation from startup", async () => {
    const driver = new FakeUpdateDriver();
    driver.checkForUpdates.mockImplementationOnce(async () => {
      driver.emit("update-available", { version: "1.1.0" });
    });
    const service = new DesktopUpdateService(driver, {
      currentVersion: "1.0.0",
      enabled: true,
      initialStatus: {
        state: "error",
        currentVersion: "1.0.0",
        version: "1.1.0",
        message: "installer stopped",
      },
    });

    await service.download();

    expect(driver.checkForUpdates).toHaveBeenCalledOnce();
    expect(driver.downloadUpdate).toHaveBeenCalledOnce();
    expect(service.getStatus()).toMatchObject({ state: "downloading", version: "1.1.0" });
  });

  it("keeps the target visible when refreshing a failed install also fails", async () => {
    const driver = new FakeUpdateDriver();
    driver.checkForUpdates.mockRejectedValueOnce(new Error("feed unavailable"));
    const service = new DesktopUpdateService(driver, {
      currentVersion: "1.0.0",
      enabled: true,
      initialStatus: {
        state: "error",
        currentVersion: "1.0.0",
        version: "1.1.0",
        message: "installer stopped",
      },
    });

    await service.download();

    expect(service.getStatus()).toEqual({
      state: "error",
      currentVersion: "1.0.0",
      version: "1.1.0",
      message: "feed unavailable",
    });
  });

  it("keeps the target version after a download error so the UI can retry", async () => {
    const driver = new FakeUpdateDriver();
    driver.downloadUpdate.mockRejectedValueOnce(new Error("network unavailable"));
    const service = new DesktopUpdateService(driver, {
      currentVersion: "1.0.0",
      enabled: true,
    });
    driver.emit("update-available", { version: "1.1.0" });

    await service.download();
    expect(service.getStatus()).toEqual({
      state: "error",
      currentVersion: "1.0.0",
      version: "1.1.0",
      message: "network unavailable",
    });

    await service.download();
    expect(driver.downloadUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not check or install from an unpackaged development build", async () => {
    const driver = new FakeUpdateDriver();
    const service = new DesktopUpdateService(driver, {
      currentVersion: "0.0.0",
      enabled: false,
    });

    await service.check();
    service.quitAndInstall();
    expect(driver.checkForUpdates).not.toHaveBeenCalled();
    expect(driver.quitAndInstall).not.toHaveBeenCalled();
  });
});
