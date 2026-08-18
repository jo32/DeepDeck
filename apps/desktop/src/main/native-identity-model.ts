import type { AboutPanelOptionsOptions, MenuItemConstructorOptions } from "electron";
import type { LoadedBranding } from "./branding.js";

export function createAboutPanelOptions(
  branding: LoadedBranding,
  applicationVersion: string,
  platform: NodeJS.Platform,
): AboutPanelOptionsOptions {
  return {
    applicationName: branding.name,
    applicationVersion,
    credits: branding.tagline,
    ...(platform === "darwin" ? {} : { iconPath: branding.appIconPath }),
  };
}

export function createMacApplicationMenuTemplate(
  applicationName: string,
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        { label: `About ${applicationName}`, role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ];
}
