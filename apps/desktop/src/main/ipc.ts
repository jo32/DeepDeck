import { ipcMain } from "electron";
import { channels } from "../preload/channels.js";
import type { DesktopBranding } from "../shared/branding.js";
import type { HarnessProcess } from "./harness/harness-process.js";
import type { DesktopUpdateService } from "./update-service.js";

export function registerIpc(
  harness: HarnessProcess,
  branding: DesktopBranding,
  updates: DesktopUpdateService,
): () => void {
  ipcMain.handle(channels.brandingGet, () => branding);
  ipcMain.handle(channels.runtimeGet, () => harness.getStatus());
  ipcMain.handle(channels.runtimeRestart, async () => {
    try {
      await harness.restart();
    } catch {
      // The process manager has already published the actionable error state.
    }
    return harness.getStatus();
  });
  ipcMain.handle(channels.updatesGet, () => updates.getStatus());
  ipcMain.handle(channels.updatesDownload, () => updates.download());
  return () => {
    ipcMain.removeHandler(channels.brandingGet);
    ipcMain.removeHandler(channels.runtimeGet);
    ipcMain.removeHandler(channels.runtimeRestart);
    ipcMain.removeHandler(channels.updatesGet);
    ipcMain.removeHandler(channels.updatesDownload);
  };
}
