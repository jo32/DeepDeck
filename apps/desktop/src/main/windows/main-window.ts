import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import {
  brandPageTitle,
  harnessBrandingCss,
  harnessBrandingScript,
  type LoadedBranding,
} from "../branding.js";
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
  let insertedCss: string | undefined;

  const window = new BrowserWindow({
    ...state,
    minWidth: 960,
    minHeight: 680,
    title: branding.name,
    icon: branding.appIconPath,
    backgroundColor: "#f7f8f6",
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const clearHarnessBranding = async (): Promise<void> => {
    if (!insertedCss) return;
    const key = insertedCss;
    insertedCss = undefined;
    await window.webContents.removeInsertedCSS(key);
  };

  const applyHarnessBranding = async (): Promise<void> => {
    const currentUrl = window.webContents.getURL();
    if (!harnessOrigin || !currentUrl.startsWith(harnessOrigin)) return;
    await clearHarnessBranding();
    insertedCss = await window.webContents.insertCSS(harnessBrandingCss(branding));
    await window.webContents.executeJavaScript(harnessBrandingScript(branding), true);
  };

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
  window.webContents.on("did-finish-load", () => {
    void applyHarnessBranding().catch((error: unknown) => {
      console.error("Unable to apply desktop branding", error);
    });
  });
  window.webContents.on("page-title-updated", (event, title) => {
    if (!harnessOrigin || !window.webContents.getURL().startsWith(harnessOrigin)) return;
    const brandedTitle = brandPageTitle(title, branding);
    if (brandedTitle === title) return;
    event.preventDefault();
    window.setTitle(brandedTitle);
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
    allowHarnessOrigin: (origin) => {
      harnessOrigin = origin;
      if (origin === undefined) {
        void clearHarnessBranding().catch(() => undefined);
      }
    },
    loadSplash,
  };
}
