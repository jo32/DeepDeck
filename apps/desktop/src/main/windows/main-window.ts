import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import type { LoadedBranding } from "../branding.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

export interface DesktopWindow {
  window: BrowserWindow;
  allowHarnessOrigin(origin: string | undefined): void;
  loadSplash(): Promise<void>;
}

function isExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function createMainWindow(branding: LoadedBranding): Promise<DesktopWindow> {
  const statePath = join(app.getPath("userData"), "window-state.json");
  const state = await loadWindowState(statePath);
  let harnessOrigin: string | undefined;

  const window = new BrowserWindow({
    ...state,
    minWidth: 960,
    minHeight: 680,
    title: branding.name,
    icon: branding.appIconPath,
    backgroundColor: "#f7f8f6",
    show: false,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : {}),
    webPreferences: {
      preload: join(import.meta.dirname, "../../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const loadSplash = async (): Promise<void> => {
    const developmentUrl = process.env.DEEPSEEK_DESKTOP_RENDERER_URL;
    if (developmentUrl) await window.loadURL(developmentUrl);
    else await window.loadFile(join(import.meta.dirname, "../../renderer/index.html"));
  };

  window.once("ready-to-show", () => {
    if (state.maximized) window.maximize();
    window.show();
  });
  window.on("close", () => {
    const bounds = window.getBounds();
    void saveWindowState(statePath, { ...bounds, maximized: window.isMaximized() });
  });
  window.webContents.on("page-title-updated", (event) => {
    if (!harnessOrigin || !window.webContents.getURL().startsWith(harnessOrigin)) return;
    event.preventDefault();
    window.setTitle(branding.name);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    const targetUrl = new URL(target);
    if (targetUrl.protocol === "file:") return;
    if (harnessOrigin && targetUrl.origin === harnessOrigin) return;
    event.preventDefault();
    if (isExternalUrl(target)) void shell.openExternal(target);
  });

  await loadSplash();
  return {
    window,
    allowHarnessOrigin: (origin) => { harnessOrigin = origin; },
    loadSplash,
  };
}
