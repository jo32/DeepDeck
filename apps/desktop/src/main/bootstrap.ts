import { resolve } from "node:path";
import { app, BrowserWindow, Menu, nativeImage } from "electron";
import { channels } from "../preload/channels.js";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";
import { publicBranding, type LoadedBranding } from "./branding.js";
import { createDesktopUpdateService } from "./auto-update.js";
import { HarnessProcess } from "./harness/harness-process.js";
import { registerIpc } from "./ipc.js";
import { createAutomaticUpdateInstaller } from "./update-installer.js";
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
    patchPath: requiredEnvironment(
      "OPENWORKBUDDY_HARNESS_PATCH",
      resolve(app.getAppPath(), "../../plugins/desktop-chrome/cordis.patch.yml"),
    ),
    plugins: [
      {
        packageName: "@openworkbuddy/dsh-client-ui-desktop-chrome",
        path: requiredEnvironment(
          "OPENWORKBUDDY_DESKTOP_CHROME_PLUGIN",
          resolve(app.getAppPath(), "../../plugins/desktop-chrome"),
        ),
      },
      {
        packageName: "@openworkbuddy/dsh-client-ui-home-hero",
        path: requiredEnvironment(
          "OPENWORKBUDDY_HOME_HERO_PLUGIN",
          resolve(app.getAppPath(), "../../plugins/home-hero"),
        ),
      },
      {
        packageName: "@openworkbuddy/dsh-client-ui-agent-preset-sections",
        path: requiredEnvironment(
          "OPENWORKBUDDY_AGENT_PRESET_PLUGIN",
          resolve(app.getAppPath(), "../../plugins/agent-preset-sections"),
        ),
      },
    ],
    displayName: branding.name,
  });
  const updates = createDesktopUpdateService();
  let desktopWindow: DesktopWindow | undefined;
  let showingSplash = true;
  let removeIpc = (): void => {};
  let removeStatusListener = (): void => {};
  let removeUpdateListener = (): void => {};
  let updateCheckTimer: ReturnType<typeof setTimeout> | undefined;
  let quitReady = false;
  let prepareToQuitPromise: Promise<void> | undefined;

  const prepareToQuit = (): Promise<void> => {
    prepareToQuitPromise ??= harness.stop()
      .catch((error: unknown) => {
        console.error("Unable to stop the Harness process cleanly", error);
      })
      .then(() => {
        if (updateCheckTimer) clearTimeout(updateCheckTimer);
        removeStatusListener();
        removeUpdateListener();
        removeIpc();
        updates.dispose();
        quitReady = true;
      });
    return prepareToQuitPromise;
  };

  const installUpdate = createAutomaticUpdateInstaller(updates, prepareToQuit);

  removeIpc = registerIpc(harness, publicBranding(branding), updates);

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
    desktopWindow.window.webContents.send(channels.updatesStatus, updates.getStatus());
  };

  await createWindow();
  removeStatusListener = harness.onStatus((status) => {
    void showStatus(status).catch((error: unknown) => {
      console.error("Unable to update desktop window", error);
    });
  });
  removeUpdateListener = updates.onStatus((status) => {
    const window = desktopWindow?.window;
    if (window && !window.isDestroyed()) {
      window.webContents.send(channels.updatesStatus, status);
    }
    void installUpdate(status).catch((error: unknown) => {
      console.error("Unable to restart into the downloaded update", error);
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

  app.on("before-quit", (event) => {
    if (quitReady) return;
    event.preventDefault();
    void prepareToQuit().then(() => app.quit());
  });

  void harness.start().catch(() => {
    // The status page receives the full process error and offers a retry.
  });
  updateCheckTimer = setTimeout(() => {
    void updates.check();
  }, 2_000);
}
