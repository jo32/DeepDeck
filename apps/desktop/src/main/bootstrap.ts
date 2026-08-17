import { resolve } from "node:path";
import { app, BrowserWindow, Menu, nativeImage } from "electron";
import { channels } from "../preload/channels.js";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";
import { publicBranding, type LoadedBranding } from "./branding.js";
import { HarnessProcess } from "./harness/harness-process.js";
import { registerIpc } from "./ipc.js";
import { createMainWindow, type DesktopWindow } from "./windows/main-window.js";

function requiredEnvironment(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

export async function bootstrapDesktop(branding: LoadedBranding): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();
  Menu.setApplicationMenu(null);
  const appIcon = nativeImage.createFromPath(branding.appIconPath);
  if (process.platform === "darwin" && !appIcon.isEmpty()) app.dock?.setIcon(appIcon);

  const harness = new HarnessProcess({
    harnessRoot: requiredEnvironment(
      "DEEPSEEK_HARNESS_PATH",
      resolve(app.getAppPath(), "../../vendor/deepseek-harness"),
    ),
    nodeBinary: requiredEnvironment(
      "DEEPSEEK_DESKTOP_NODE_BINARY",
      process.env.npm_node_execpath ?? "node",
    ),
    workspaceRoot: requiredEnvironment("DEEPSEEK_DESKTOP_WORKSPACE", process.cwd()),
    displayName: branding.name,
  });
  const removeIpc = registerIpc(harness, publicBranding(branding));
  let desktopWindow: DesktopWindow | undefined;
  let showingSplash = true;

  const showStatus = async (status: HarnessRuntimeStatus): Promise<void> => {
    const current = desktopWindow;
    if (!current || current.window.isDestroyed()) return;
    current.window.webContents.send(channels.runtimeStatus, status);
    if (status.state === "ready" && status.url) {
      current.allowHarnessOrigin(new URL(status.url).origin);
      showingSplash = false;
      if (!current.window.webContents.getURL().startsWith(status.url)) {
        await current.window.loadURL(status.url);
      }
    } else if (status.state === "error" && !showingSplash) {
      current.allowHarnessOrigin(undefined);
      showingSplash = true;
      await current.loadSplash();
      current.window.webContents.send(channels.runtimeStatus, status);
    }
  };

  const createWindow = async (): Promise<void> => {
    desktopWindow = await createMainWindow(branding);
    showingSplash = true;
    await showStatus(harness.getStatus());
  };

  await createWindow();
  const removeStatusListener = harness.onStatus((status) => {
    void showStatus(status).catch((error: unknown) => {
      console.error("Unable to update desktop window", error);
    });
  });

  app.on("second-instance", () => {
    const window = desktopWindow?.window;
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  let quitReady = false;
  app.on("before-quit", (event) => {
    if (quitReady) return;
    event.preventDefault();
    void harness.stop().finally(() => {
      quitReady = true;
      removeStatusListener();
      removeIpc();
      app.quit();
    });
  });

  void harness.start().catch(() => {
    // The status page receives the full process error and offers a retry.
  });
}
