import { app, BaseWindow, nativeTheme } from "electron";
import { channels } from "../preload/channels.js";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";
import type { DesktopUpdateStatus } from "../shared/update.js";
import { publicBranding, type LoadedBranding } from "./branding.js";
import { createDesktopUpdateService } from "./auto-update.js";
import { HarnessProcess, resolveHarnessHome } from "./harness/harness-process.js";
import { HarnessRestartRecovery } from "./harness/restart-recovery.js";
import { registerIpc } from "./ipc.js";
import { configureNativeApplicationIdentity } from "./native-identity.js";
import type { DesktopRuntimePaths } from "./runtime-paths.js";
import { readThemeSource } from "./theme-preference.js";
import { createDesktopTelemetry } from "./vibeloft-telemetry.js";
import { createUpdateInstaller } from "./update-installer.js";
import { shouldForceExitForUpdate } from "./update-quit-policy.js";
import {
  launchMacUpdateHelper,
  resolveMacAppPath,
  resolveMacUpdateHelperPath,
} from "./update-relauncher.js";
import {
  classifyUpdateStartup,
  clearUpdateTransaction,
  isProcessAlive,
  readUpdateTransaction,
  updateTransactionPath,
  writeUpdateTransaction,
  type UpdateTransaction,
} from "./update-transaction.js";
import { createMainWindow, type DesktopWindow } from "./windows/main-window.js";
import { createAppWindowManager } from "./windows/app-window.js";
import { createBrowserWindowManager } from "./windows/browser-window.js";
import { isSameOriginHttpUrl } from "./windows/app-window-request.js";

export async function bootstrapDesktop(
  branding: LoadedBranding,
  runtimePaths: DesktopRuntimePaths,
): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const transactionFilename = updateTransactionPath(app.getPath("userData"));
  const existingTransaction = process.platform === "darwin"
    ? await readUpdateTransaction(transactionFilename)
    : undefined;
  const updateStartup = classifyUpdateStartup(
    existingTransaction,
    app.getVersion(),
    isProcessAlive,
  );
  if (updateStartup.state === "active") {
    // The standalone helper remains visible and owns the install experience.
    // Do not launch the old runtime or contend with ShipIt for the app bundle.
    app.releaseSingleInstanceLock();
    app.exit(0);
    return;
  }

  let initialUpdateStatus: DesktopUpdateStatus | undefined;
  let shouldCheckForUpdates = true;
  if (updateStartup.state === "completed") {
    await clearUpdateTransaction(transactionFilename);
    initialUpdateStatus = {
      state: "updated",
      currentVersion: app.getVersion(),
      version: app.getVersion(),
    };
    shouldCheckForUpdates = false;
  } else if (updateStartup.state === "failed") {
    await writeUpdateTransaction(transactionFilename, updateStartup.transaction);
    initialUpdateStatus = {
      state: "error",
      currentVersion: app.getVersion(),
      version: updateStartup.transaction.targetVersion,
      message: updateStartup.transaction.message ?? "Update installation did not complete.",
    };
    shouldCheckForUpdates = false;
  }

  await app.whenReady();
  nativeTheme.themeSource = await readThemeSource(resolveHarnessHome());
  configureNativeApplicationIdentity(branding);

  const telemetry = await createDesktopTelemetry(app);

  const appWindows = createAppWindowManager(branding.name);
  const browserWindows = createBrowserWindowManager(branding.name, snapshot => harness.sendBrowserSnapshot(snapshot));
  const restartRecovery = new HarnessRestartRecovery();
  let desktopWindow: DesktopWindow | undefined;
  let restartInFlight = false;
  const focusMainWindow = (): void => {
    const window = desktopWindow?.window;
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  const harness = new HarnessProcess({
    harnessRoot: runtimePaths.harnessRoot,
    nodeBinary: runtimePaths.nodeBinary,
    workspaceRoot: runtimePaths.workspaceRoot,
    patchPath: runtimePaths.patchPath,
    plugins: runtimePaths.plugins,
    displayName: branding.name,
    onBrowserRequest: async (command, baseUrl) => {
      if (command.action === "open") {
        if (!isSameOriginHttpUrl(command.shellUrl, baseUrl)) throw new Error("Browser shell must be served by the current Harness.");
        const url = new URL(command.shellUrl);
        if (url.pathname !== "/" || url.searchParams.get("deepdeck-surface") !== "browser") throw new Error("Invalid Browser shell route.");
      }
      return await browserWindows.execute(command);
    },
    onAppWindowOpenRequest: (url) => {
      // The child may only promote pages served by this very Harness server;
      // everything else is dropped without surfacing a window.
      const base = harness.getStatus().url;
      if (!base || !isSameOriginHttpUrl(url, base)) return;
      telemetry.trackScreen("apps");
      appWindows.open(url);
    },
    onAppWindowsReloadRequest: async url => await appWindows.reload(url),
    onMainWindowFocusRequest: focusMainWindow,
    onRestartRequest: () => {
      const baseUrl = harness.getStatus().url;
      if (baseUrl === undefined) {
        harness.resolveRestartRequest(false);
        return;
      }
      const request = restartRecovery.request(appWindows.snapshot(baseUrl));
      if (request === undefined) {
        harness.resolveRestartRequest(false);
        return;
      }
      const current = desktopWindow;
      if (current === undefined || current.window.isDestroyed()) {
        restartRecovery.decide({ requestId: request.requestId, confirmed: false, sessions: [] });
        harness.resolveRestartRequest(false);
        return;
      }
      current.send(channels.runtimeRestartRequested, request);
    },
  });
  const updates = createDesktopUpdateService(initialUpdateStatus);
  let removeIpc = (): void => {};
  let removeStatusListener = (): void => {};
  let removeUpdateListener = (): void => {};
  let updateCheckTimer: ReturnType<typeof setTimeout> | undefined;
  let quitReady = false;
  let installingUpdateVersion: string | undefined;
  let prepareToQuitPromise: Promise<void> | undefined;

  const prepareToQuit = (): Promise<void> => {
    prepareToQuitPromise ??= Promise.all([
      harness.stop().catch((error: unknown) => {
        console.error("Unable to stop the Harness process cleanly", error);
      }),
      telemetry.close().catch((error: unknown) => {
        console.error("Unable to flush VibeLoft telemetry", error);
      }),
    ])
      .then(() => {
        if (updateCheckTimer) clearTimeout(updateCheckTimer);
        removeStatusListener();
        removeUpdateListener();
        removeIpc();
        appWindows.dispose();
        browserWindows.dispose();
        updates.dispose();
        quitReady = true;
      });
    return prepareToQuitPromise;
  };

  const installUpdate = createUpdateInstaller(updates, prepareToQuit, async (status) => {
    if (status.state !== "downloaded" || !status.version) return;
    installingUpdateVersion = status.version;
    if (process.platform === "darwin") {
      const now = Date.now();
      const appPath = resolveMacAppPath(app.getPath("exe"));
      const transaction: UpdateTransaction = {
        schemaVersion: 1,
        phase: "preparing",
        sourceVersion: app.getVersion(),
        targetVersion: status.version,
        appPath,
        startedAt: now,
        updatedAt: now,
      };
      await writeUpdateTransaction(transactionFilename, transaction);
      const helper = await launchMacUpdateHelper({
        helperPath: resolveMacUpdateHelperPath(process.resourcesPath),
        appPath,
        statePath: transactionFilename,
        currentPid: process.pid,
        sourceVersion: app.getVersion(),
        targetVersion: status.version,
        displayName: branding.name,
        locale: app.getLocale(),
      });
      if (!helper.pid) throw new Error("Unable to start the update helper.");
      await writeUpdateTransaction(transactionFilename, {
        ...transaction,
        phase: "installing",
        updatedAt: Date.now(),
        helperPid: helper.pid,
      });
    }
  });

  const requestInstallUpdate = (): DesktopUpdateStatus => {
    const downloaded = updates.getStatus();
    if (downloaded.state !== "downloaded" || !downloaded.version) return downloaded;
    updates.markInstalling();
    void installUpdate(downloaded).catch((error: unknown) => {
      console.error("Unable to restart into the downloaded update", error);
      installingUpdateVersion = undefined;
      updates.reportInstallFailure(error, downloaded.version);
      if (process.platform === "darwin") {
        void readUpdateTransaction(transactionFilename)
          .then((previous) => previous
            ? writeUpdateTransaction(transactionFilename, {
                ...previous,
                phase: "failed",
                updatedAt: Date.now(),
                message: error instanceof Error ? error.message : String(error),
              })
            : undefined)
          .catch((transactionError: unknown) => {
            console.error("Unable to persist the failed update transaction", transactionError);
          });
      }
    });
    return updates.getStatus();
  };

  removeIpc = registerIpc(harness, publicBranding(branding), updates, {
    onHarnessClientReady: (senderId) => {
      desktopWindow?.markHarnessClientReady(senderId);
    },
    onInstallUpdate: requestInstallUpdate,
    onPendingRestart: (senderId) => (
      desktopWindow?.isHarnessRenderer(senderId) === true
        ? restartRecovery.pendingRequest()
        : undefined
    ),
    onRestartDecision: (senderId, decision) => {
      if (desktopWindow?.isHarnessRenderer(senderId) !== true) return false;
      const baseUrl = harness.getStatus().url;
      const result = restartRecovery.decide(
        decision,
        baseUrl === undefined ? undefined : appWindows.snapshot(baseUrl),
      );
      if (result === "ignored") return false;
      if (result === "cancelled") {
        harness.resolveRestartRequest(false);
        return true;
      }
      harness.resolveRestartRequest(true);
      if (!restartInFlight) {
        restartInFlight = true;
        void harness.restart()
          .catch((error: unknown) => {
            console.error("Unable to restart the Harness after user confirmation", error);
          })
          .finally(() => { restartInFlight = false; });
      }
      return true;
    },
    onRestartRecovery: (senderId) => (
      desktopWindow?.isHarnessRenderer(senderId) === true
        ? restartRecovery.recovery()
        : undefined
    ),
    onAcknowledgeRestartRecovery: (senderId, recoveryId, sessionIds) => (
      desktopWindow?.isHarnessRenderer(senderId) === true
        ? restartRecovery.acknowledge(recoveryId, sessionIds)
        : false
    ),
    onTelemetryScreen: screen => telemetry.trackScreen(screen),
  });

  const showStatus = async (status: HarnessRuntimeStatus): Promise<void> => {
    const current = desktopWindow;
    if (!current || current.window.isDestroyed()) return;
    // Keep the current conversation visible while the native helper opens and
    // Harness shuts down. The old full-window skeleton made a normal restart
    // look like the app had hung before disappearing.
    if (installingUpdateVersion) {
      return;
    }
    current.send(channels.runtimeStatus, status);
    if (status.state === "ready" && status.url) {
      await current.loadHarness(status.url);
      await browserWindows.restoreShell(status.url);
      harness.sendBrowserSnapshot(browserWindows.snapshot());
      const appRoutes = restartRecovery.appRoutes();
      if (appRoutes.length > 0) {
        const receipt = await appWindows.restore(status.url, appRoutes);
        if (receipt.failed > 0) {
          console.error(`Unable to restore ${String(receipt.failed)} App window(s) after restart`);
        }
        restartRecovery.markAppsRestored();
      }
    } else {
      current.showSplash();
    }
  };

  const createWindow = async (): Promise<void> => {
    desktopWindow = await createMainWindow(branding);
    await showStatus(harness.getStatus());
    desktopWindow.send(channels.updatesStatus, updates.getStatus());
    telemetry.trackScreen("home");
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
  });

  app.on("second-instance", () => {
    focusMainWindow();
  });
  app.on("activate", () => {
    if (installingUpdateVersion) return;
    if (BaseWindow.getAllWindows().length === 0) void createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (event) => {
    if (shouldForceExitForUpdate(quitReady, installingUpdateVersion)) {
      event.preventDefault();
      app.exit(0);
      return;
    }
    if (quitReady) return;
    event.preventDefault();
    void prepareToQuit().then(() => app.quit());
  });

  void harness.start().catch(() => {
    // The status page receives the full process error and offers a retry.
  });
  if (shouldCheckForUpdates) {
    updateCheckTimer = setTimeout(() => {
      void updates.check();
    }, 2_000);
  }
}
