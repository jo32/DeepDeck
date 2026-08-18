import { app } from "electron";
import electronUpdater from "electron-updater";
import { isLocalDesktopPackage } from "./package-metadata.js";
import { DesktopUpdateService, type UpdateDriver } from "./update-service.js";
import { shouldEnableDesktopUpdates } from "./update-policy.js";

const { autoUpdater } = electronUpdater;

export function createDesktopUpdateService(): DesktopUpdateService {
  const updateUrl = process.env.DEEPSEEK_DESKTOP_UPDATE_URL?.trim();
  if (updateUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });
  }
  autoUpdater.logger = console;

  return new DesktopUpdateService(autoUpdater as unknown as UpdateDriver, {
    currentVersion: app.getVersion(),
    enabled: shouldEnableDesktopUpdates(
      app.isPackaged,
      isLocalDesktopPackage(app.getAppPath()),
    ),
  });
}
