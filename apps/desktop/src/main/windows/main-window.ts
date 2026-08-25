import { join } from "node:path";
import {
  app,
  BaseWindow,
  nativeTheme,
  shell,
  WebContentsView,
  type WebContents,
} from "electron";
import type { LoadedBranding } from "../branding.js";
import { isExternalUrl, isPopupPlaceholder } from "./external-popup.js";
import { HarnessViewGate } from "./harness-view-gate.js";
import { HarnessViewReveal } from "./harness-view-reveal.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

export interface DesktopWindow {
  window: BaseWindow;
  loadHarness(url: string): Promise<void>;
  loadSplash(): Promise<void>;
  markHarnessClientReady(senderId: number): void;
  send(channel: string, ...args: unknown[]): void;
  showSplash(): void;
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

  const window = new BaseWindow({
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
  });

  const splashView = new WebContentsView({
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const splashContents = splashView.webContents;

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
  splashView.setBackgroundColor(splashBackgroundColor(nativeTheme.shouldUseDarkColors));
  harnessView.setVisible(false);
  harnessView.setBackgroundColor(splashBackgroundColor(nativeTheme.shouldUseDarkColors));
  window.contentView.addChildView(splashView);
  window.contentView.addChildView(harnessView);

  const viewReveal = new HarnessViewReveal({
    stage: () => {
      harnessView.setVisible(true);
      splashView.setVisible(true);
      // Re-adding an existing child makes it topmost. Harness can now paint,
      // but every intermediate frame remains covered by the native splash.
      window.contentView.addChildView(splashView);
    },
    capture: async () => {
      await harnessContents.capturePage(undefined, { stayHidden: true });
    },
    reveal: () => {
      splashView.setVisible(false);
      window.contentView.addChildView(harnessView);
      harnessContents.focus();
    },
    conceal: () => {
      harnessView.setVisible(false);
      splashView.setVisible(true);
      window.contentView.addChildView(splashView);
    },
  });

  const resizeContentViews = (): void => {
    const [width = 0, height = 0] = window.getContentSize();
    const bounds = { x: 0, y: 0, width, height };
    splashView.setBounds(bounds);
    harnessView.setBounds(bounds);
  };
  resizeContentViews();

  const loadSplash = async (): Promise<void> => {
    viewReveal.conceal();
    if (developmentUrl) await splashContents.loadURL(developmentUrl);
    else await splashContents.loadFile(join(import.meta.dirname, "../../renderer/index.html"));
  };

  window.on("close", () => {
    const bounds = window.getBounds();
    void saveWindowState(statePath, { ...bounds, maximized: window.isMaximized() });
  });
  window.on("resize", resizeContentViews);
  const syncBackgroundColor = (): void => {
    const color = splashBackgroundColor(nativeTheme.shouldUseDarkColors);
    window.setBackgroundColor(color);
    splashView.setBackgroundColor(color);
    harnessView.setBackgroundColor(color);
  };
  nativeTheme.on("updated", syncBackgroundColor);
  window.once("closed", () => {
    nativeTheme.off("updated", syncBackgroundColor);
    if (!splashContents.isDestroyed()) splashContents.close();
    if (!harnessContents.isDestroyed()) harnessContents.close();
  });

  harnessContents.on("page-title-updated", (event) => {
    if (!gate.allows(harnessContents.getURL())) return;
    event.preventDefault();
    window.setTitle(branding.name);
  });
  harnessContents.setWindowOpenHandler(({ url }) => {
    if (isPopupPlaceholder(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    if (isExternalUrl(url) && !gate.allows(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  harnessContents.on("did-create-window", (popup, details) => {
    if (!isPopupPlaceholder(details.url)) {
      popup.close();
      return;
    }

    popup.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    popup.webContents.on("will-navigate", (event, target) => {
      event.preventDefault();
      if (isExternalUrl(target)) void shell.openExternal(target);
      if (!popup.isDestroyed()) popup.close();
    });
  });
  harnessContents.on("will-navigate", (event, target) => {
    if (gate.allows(target)) return;
    event.preventDefault();
    if (isExternalUrl(target)) void shell.openExternal(target);
  });
  harnessContents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    if (!gate.beginDocument(details.url)) return;
    viewReveal.conceal();
  });
  harnessContents.on("did-finish-load", () => {
    if (gate.finishDocument(harnessContents.getURL())) viewReveal.request();
  });

  splashContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url) && new URL(url).origin !== developmentOrigin) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  splashContents.on("will-navigate", (event, target) => {
    const targetUrl = new URL(target);
    if (targetUrl.protocol === "file:" || targetUrl.origin === developmentOrigin) return;
    event.preventDefault();
    if (isExternalUrl(target)) void shell.openExternal(target);
  });

  await loadSplash();
  if (state.maximized) window.maximize();
  window.show();
  return {
    window,
    loadHarness: async (url) => {
      const generation = ++harnessLoadGeneration;
      gate.begin(url);
      viewReveal.conceal();
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
      if (gate.markClientReady(harnessContents.getURL())) viewReveal.request();
    },
    send: (channel, ...args) => {
      const renderers: WebContents[] = [splashContents, harnessContents];
      for (const renderer of renderers) {
        if (!renderer.isDestroyed()) renderer.send(channel, ...args);
      }
    },
    showSplash: () => {
      harnessLoadGeneration += 1;
      gate.suspend();
      viewReveal.conceal();
      splashContents.focus();
    },
  };
}
