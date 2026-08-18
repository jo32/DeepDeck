import { join } from "node:path";
import {
  app,
  BrowserWindow,
  nativeTheme,
  shell,
  WebContentsView,
  type WebContents,
} from "electron";
import type { LoadedBranding } from "../branding.js";
import { HarnessViewGate } from "./harness-view-gate.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

export interface DesktopWindow {
  window: BrowserWindow;
  loadHarness(url: string): Promise<void>;
  loadSplash(): Promise<void>;
  markHarnessClientReady(senderId: number): void;
  send(channel: string, ...args: unknown[]): void;
  showSplash(): void;
}

function isExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function splashBackgroundColor(dark: boolean): string {
  return dark ? "#151517" : "#f7f7fb";
}

export async function createMainWindow(branding: LoadedBranding): Promise<DesktopWindow> {
  const statePath = join(app.getPath("userData"), "window-state.json");
  const state = await loadWindowState(statePath);
  const preload = join(import.meta.dirname, "../../preload/index.cjs");
  const developmentUrl = process.env.DEEPSEEK_DESKTOP_RENDERER_URL;
  const developmentOrigin = developmentUrl ? new URL(developmentUrl).origin : undefined;
  const gate = new HarnessViewGate();
  let harnessLoadGeneration = 0;

  const window = new BrowserWindow({
    ...state,
    minWidth: 960,
    minHeight: 680,
    title: branding.name,
    icon: branding.appIconPath,
    backgroundColor: splashBackgroundColor(nativeTheme.shouldUseDarkColors),
    show: false,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const harnessView = new WebContentsView({
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const harnessContents = harnessView.webContents;
  harnessView.setVisible(false);
  harnessView.setBackgroundColor(splashBackgroundColor(nativeTheme.shouldUseDarkColors));
  window.contentView.addChildView(harnessView);

  const resizeHarnessView = (): void => {
    const [width = 0, height = 0] = window.getContentSize();
    harnessView.setBounds({ x: 0, y: 0, width, height });
  };
  resizeHarnessView();

  const revealHarness = (): void => {
    harnessView.setVisible(true);
    harnessContents.focus();
  };

  const loadSplash = async (): Promise<void> => {
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
  window.on("resize", resizeHarnessView);
  const syncBackgroundColor = (): void => {
    const color = splashBackgroundColor(nativeTheme.shouldUseDarkColors);
    window.setBackgroundColor(color);
    harnessView.setBackgroundColor(color);
  };
  nativeTheme.on("updated", syncBackgroundColor);
  window.once("closed", () => {
    nativeTheme.off("updated", syncBackgroundColor);
    if (!harnessContents.isDestroyed()) harnessContents.close();
  });

  harnessContents.on("page-title-updated", (event) => {
    if (!gate.allows(harnessContents.getURL())) return;
    event.preventDefault();
    window.setTitle(branding.name);
  });
  harnessContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url) && !gate.allows(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  harnessContents.on("will-navigate", (event, target) => {
    if (gate.allows(target)) return;
    event.preventDefault();
    if (isExternalUrl(target)) void shell.openExternal(target);
  });
  harnessContents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    if (!gate.beginDocument(details.url)) return;
    harnessView.setVisible(false);
  });
  harnessContents.on("did-finish-load", () => {
    if (gate.finishDocument(harnessContents.getURL())) revealHarness();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url) && new URL(url).origin !== developmentOrigin) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    const targetUrl = new URL(target);
    if (targetUrl.protocol === "file:" || targetUrl.origin === developmentOrigin) return;
    event.preventDefault();
    if (isExternalUrl(target)) void shell.openExternal(target);
  });

  await loadSplash();
  return {
    window,
    loadHarness: async (url) => {
      const generation = ++harnessLoadGeneration;
      gate.begin(url);
      harnessView.setVisible(false);
      try {
        await harnessContents.loadURL(url);
      } catch (error) {
        if (generation === harnessLoadGeneration) gate.suspend();
        throw error;
      }
    },
    loadSplash,
    markHarnessClientReady: (senderId) => {
      if (senderId !== harnessContents.id) return;
      if (gate.markClientReady(harnessContents.getURL())) revealHarness();
    },
    send: (channel, ...args) => {
      const renderers: WebContents[] = [window.webContents, harnessContents];
      for (const renderer of renderers) {
        if (!renderer.isDestroyed()) renderer.send(channel, ...args);
      }
    },
    showSplash: () => {
      harnessLoadGeneration += 1;
      gate.suspend();
      harnessView.setVisible(false);
      window.webContents.focus();
    },
  };
}
