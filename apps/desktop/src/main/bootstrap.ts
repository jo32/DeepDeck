import { app, BaseWindow, nativeTheme } from "electron";
import { channels } from "../preload/channels.js";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";
import { publicBranding, type LoadedBranding } from "./branding.js";
import { createDesktopUpdateService } from "./auto-update.js";
import { HarnessProcess, resolveHarnessHome } from "./harness/harness-process.js";
import { registerIpc } from "./ipc.js";
import { configureNativeApplicationIdentity } from "./native-identity.js";
import type { DesktopRuntimePaths } from "./runtime-paths.js";
import { readThemeSource } from "./theme-preference.js";
import { createAutomaticUpdateInstaller } from "./update-installer.js";
import { armMacUpdateRelaunch, resolveMacAppPath } from "./update-relauncher.js";
import { createMainWindow, type DesktopWindow } from "./windows/main-window.js";

export async function bootstrapDesktop(
  branding: LoadedBranding,
  runtimePaths: DesktopRuntimePaths,
): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();
  nativeTheme.themeSource = await readThemeSource(resolveHarnessHome());
  configureNativeApplicationIdentity(branding);

  const harness = new HarnessProcess({
    harnessRoot: runtimePaths.harnessRoot,
    nodeBinary: runtimePaths.nodeBinary,
    workspaceRoot: runtimePaths.workspaceRoot,
    patchPath: runtimePaths.patchPath,
    plugins: runtimePaths.plugins,
    displayName: branding.name,
  });
  const updates = createDesktopUpdateService();
  let desktopWindow: DesktopWindow | undefined;
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

  const installUpdate = createAutomaticUpdateInstaller(updates, prepareToQuit, (status) => {
    if (process.platform !== "darwin" || status.state !== "downloaded" || !status.version) return;
    armMacUpdateRelaunch({
      appPath: resolveMacAppPath(app.getPath("exe")),
      currentPid: process.pid,
      targetVersion: status.version,
    });
  });

  removeIpc = registerIpc(harness, publicBranding(branding), updates, {
    onHarnessClientReady: (senderId) => {
      desktopWindow?.markHarnessClientReady(senderId);
    },
  });

  const showStatus = async (status: HarnessRuntimeStatus): Promise<void> => {
    const current = desktopWindow;
    if (!current || current.window.isDestroyed()) return;
    current.send(channels.runtimeStatus, status);
    if (status.state === "ready" && status.url) {
      await current.loadHarness(status.url);
    } else {
      current.showSplash();
    }
  };

  const createWindow = async (): Promise<void> => {
    desktopWindow = await createMainWindow(branding);
    await showStatus(harness.getStatus());
    desktopWindow.send(channels.updatesStatus, updates.getStatus());
  };

  await createWindow();
  removeStatusListener = harness.onStatus((status) => {
    void showStatus(status).catch((error: unknown) => {
      console.error("Unable to update desktop window", error);
    });
  });
  removeUpdateListener = updates.onStatus((status) => {
    const current = desktopWindow;
    if (current && !current.window.isDestroyed()) {
      current.send(channels.updatesStatus, status);
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
    if (BaseWindow.getAllWindows().length === 0) void createWindow();
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
