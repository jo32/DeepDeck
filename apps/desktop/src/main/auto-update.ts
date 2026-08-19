import { app } from "electron";
import electronUpdater from "electron-updater";
import type { DesktopUpdateStatus } from "../shared/update.js";
import { isLocalDesktopPackage } from "./package-metadata.js";
import { DesktopUpdateService, type UpdateDriver } from "./update-service.js";
import { shouldEnableDesktopUpdates } from "./update-policy.js";

const { autoUpdater } = electronUpdater;

export function createDesktopUpdateService(
  initialStatus?: DesktopUpdateStatus,
): DesktopUpdateService {
  const updateUrl = process.env.DEEPSEEK_DESKTOP_UPDATE_URL?.trim();
  if (updateUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });
  }
  autoUpdater.logger = console;
  // The standalone helper owns the macOS progress and relaunch experience. It
  // waits for ShipIt, verifies the replacement, and only then opens DeepDeck.
  if (process.platform === "darwin") {
    autoUpdater.autoRunAppAfterInstall = false;
  }

  return new DesktopUpdateService(autoUpdater as unknown as UpdateDriver, {
    currentVersion: app.getVersion(),
    enabled: shouldEnableDesktopUpdates(
      app.isPackaged,
      isLocalDesktopPackage(app.getAppPath()),
    ),
    ...(initialStatus ? { initialStatus } : {}),
  });
}
