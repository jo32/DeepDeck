import { ipcMain, nativeTheme, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { channels } from "../preload/channels.js";
import type { DesktopBranding } from "../shared/branding.js";
import type {
  DesktopRestartDecision,
  DesktopRestartRecovery,
  DesktopRestartRequest,
} from "../shared/runtime.js";
import { isDesktopThemeSource } from "../shared/theme.js";
import type { DesktopUpdateStatus } from "../shared/update.js";
import type { HarnessProcess } from "./harness/harness-process.js";
import type { DesktopUpdateService } from "./update-service.js";

export interface DesktopIpcHooks {
  onHarnessClientReady(senderId: number): void;
  onInstallUpdate(): DesktopUpdateStatus;
  onPendingRestart(senderId: number): DesktopRestartRequest | undefined;
  onRestartDecision(senderId: number, decision: unknown): boolean;
  onRestartRecovery(senderId: number): DesktopRestartRecovery | undefined;
  onAcknowledgeRestartRecovery(senderId: number, recoveryId: unknown, sessionIds: unknown): boolean;
  onTelemetryScreen(screen: unknown): boolean;
}

export function registerIpc(
  harness: HarnessProcess,
  branding: DesktopBranding,
  updates: DesktopUpdateService,
  hooks: DesktopIpcHooks,
): () => void {
  const onHarnessClientReady = (event: IpcMainEvent): void => {
    hooks.onHarnessClientReady(event.sender.id);
  };

  ipcMain.on(channels.runtimeClientReady, onHarnessClientReady);
  ipcMain.handle(channels.appearanceSetThemeSource, (_event, source: unknown) => {
    if (!isDesktopThemeSource(source)) throw new TypeError("Invalid desktop theme source");
    nativeTheme.themeSource = source;
  });
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
  ipcMain.handle(channels.runtimePendingRestart, (event: IpcMainInvokeEvent) => (
    hooks.onPendingRestart(event.sender.id)
  ));
  ipcMain.handle(channels.runtimeDecideRestart, (event: IpcMainInvokeEvent, decision: DesktopRestartDecision) => (
    hooks.onRestartDecision(event.sender.id, decision)
  ));
  ipcMain.handle(channels.runtimeRestartRecovery, (event: IpcMainInvokeEvent) => (
    hooks.onRestartRecovery(event.sender.id)
  ));
  ipcMain.handle(
    channels.runtimeAcknowledgeRestartRecovery,
    (event: IpcMainInvokeEvent, recoveryId: unknown, sessionIds: unknown) => (
      hooks.onAcknowledgeRestartRecovery(event.sender.id, recoveryId, sessionIds)
    ),
  );
  ipcMain.handle(channels.telemetryScreen, (_event, screen: unknown) => hooks.onTelemetryScreen(screen));
  ipcMain.handle(channels.updatesGet, () => updates.getStatus());
  ipcMain.handle(channels.updatesDownload, () => updates.download());
  ipcMain.handle(channels.updatesInstall, () => hooks.onInstallUpdate());
  return () => {
    ipcMain.removeListener(channels.runtimeClientReady, onHarnessClientReady);
    ipcMain.removeHandler(channels.appearanceSetThemeSource);
    ipcMain.removeHandler(channels.brandingGet);
    ipcMain.removeHandler(channels.runtimeGet);
    ipcMain.removeHandler(channels.runtimeRestart);
    ipcMain.removeHandler(channels.runtimePendingRestart);
    ipcMain.removeHandler(channels.runtimeDecideRestart);
    ipcMain.removeHandler(channels.runtimeRestartRecovery);
    ipcMain.removeHandler(channels.runtimeAcknowledgeRestartRecovery);
    ipcMain.removeHandler(channels.telemetryScreen);
    ipcMain.removeHandler(channels.updatesGet);
    ipcMain.removeHandler(channels.updatesDownload);
    ipcMain.removeHandler(channels.updatesInstall);
  };
}
