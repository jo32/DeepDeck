import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, HarnessRuntimeStatus } from "../shared/runtime.js";
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
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: HarnessRuntimeStatus): void => {
        listener(status);
      };
      ipcRenderer.on(channels.runtimeStatus, handler);
      return () => ipcRenderer.removeListener(channels.runtimeStatus, handler);
    },
  },
  updates: {
    get: () => ipcRenderer.invoke(channels.updatesGet),
    download: () => ipcRenderer.invoke(channels.updatesDownload),
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
