import { ipcMain } from "electron";
import { channels } from "../preload/channels.js";
import type { DesktopBranding } from "../shared/branding.js";
import type { HarnessProcess } from "./harness/harness-process.js";

export function registerIpc(harness: HarnessProcess, branding: DesktopBranding): () => void {
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
  return () => {
    ipcMain.removeHandler(channels.brandingGet);
    ipcMain.removeHandler(channels.runtimeGet);
    ipcMain.removeHandler(channels.runtimeRestart);
  };
}
