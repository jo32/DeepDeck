import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopApi,
  DesktopRestartRequest,
  HarnessRuntimeStatus,
} from "../shared/runtime.js";
import type { DesktopUpdateStatus } from "../shared/update.js";
import { channels } from "./channels.js";

const api: DesktopApi = {
  appearance: {
    setThemeSource: (source) => ipcRenderer.invoke(channels.appearanceSetThemeSource, source),
  },
  branding: {
    get: () => ipcRenderer.invoke(channels.brandingGet),
  },
  runtime: {
    get: () => ipcRenderer.invoke(channels.runtimeGet),
    restart: () => ipcRenderer.invoke(channels.runtimeRestart),
    readyForDisplay: () => ipcRenderer.send(channels.runtimeClientReady),
    pendingRestart: () => ipcRenderer.invoke(channels.runtimePendingRestart),
    decideRestart: decision => ipcRenderer.invoke(channels.runtimeDecideRestart, decision),
    onRestartRequested: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, request: DesktopRestartRequest): void => {
        listener(request);
      };
      ipcRenderer.on(channels.runtimeRestartRequested, handler);
      return () => ipcRenderer.removeListener(channels.runtimeRestartRequested, handler);
    },
    restartRecovery: () => ipcRenderer.invoke(channels.runtimeRestartRecovery),
    acknowledgeRestartRecovery: (recoveryId, sessionIds) => (
      ipcRenderer.invoke(channels.runtimeAcknowledgeRestartRecovery, recoveryId, sessionIds)
    ),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: HarnessRuntimeStatus): void => {
        listener(status);
      };
      ipcRenderer.on(channels.runtimeStatus, handler);
      return () => ipcRenderer.removeListener(channels.runtimeStatus, handler);
    },
  },
  telemetry: {
    screen: name => ipcRenderer.invoke(channels.telemetryScreen, name),
  },
  updates: {
    get: () => ipcRenderer.invoke(channels.updatesGet),
    download: () => ipcRenderer.invoke(channels.updatesDownload),
    install: () => ipcRenderer.invoke(channels.updatesInstall),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: DesktopUpdateStatus): void => {
        listener(status);
      };
      ipcRenderer.on(channels.updatesStatus, handler);
      return () => ipcRenderer.removeListener(channels.updatesStatus, handler);
    },
  },
};

contextBridge.exposeInMainWorld("deepseekDesktop", Object.freeze(api));
