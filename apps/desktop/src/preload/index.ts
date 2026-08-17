import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, HarnessRuntimeStatus } from "../shared/runtime.js";
import { channels } from "./channels.js";

const api: DesktopApi = {
  branding: {
    get: () => ipcRenderer.invoke(channels.brandingGet),
  },
  runtime: {
    get: () => ipcRenderer.invoke(channels.runtimeGet),
    restart: () => ipcRenderer.invoke(channels.runtimeRestart),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: HarnessRuntimeStatus): void => {
        listener(status);
      };
      ipcRenderer.on(channels.runtimeStatus, handler);
      return () => ipcRenderer.removeListener(channels.runtimeStatus, handler);
    },
  },
};

contextBridge.exposeInMainWorld("deepseekDesktop", Object.freeze(api));
