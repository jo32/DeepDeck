import { app, Menu, nativeImage } from "electron";
import type { LoadedBranding } from "./branding.js";
import {
  createAboutPanelOptions,
  createMacApplicationMenuTemplate,
} from "./native-identity-model.js";

export function configureNativeApplicationIdentity(branding: LoadedBranding): void {
  app.setAboutPanelOptions(
    createAboutPanelOptions(branding, app.getVersion(), process.platform),
  );

  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(createMacApplicationMenuTemplate(branding.name)),
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  if (process.platform === "win32") app.setAppUserModelId("com.jo32.deepdeck");

  const appIcon = nativeImage.createFromPath(branding.appIconPath);
  if (process.platform === "darwin" && !appIcon.isEmpty()) app.dock?.setIcon(appIcon);
}
