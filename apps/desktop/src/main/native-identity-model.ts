import type { AboutPanelOptionsOptions, MenuItemConstructorOptions } from "electron";
import type { LoadedBranding } from "./branding.js";

export type NativeIdentityLocale = "en" | "zh";

const NATIVE_IDENTITY_COPY = {
  en: {
    about: (applicationName: string) => `About ${applicationName}`,
    credits: () => "Your local AI work companion",
  },
  zh: {
    about: (applicationName: string) => `关于 ${applicationName}`,
    credits: (branding: LoadedBranding) => branding.tagline,
  },
} satisfies Record<
  NativeIdentityLocale,
  {
    about: (applicationName: string) => string;
    credits: (branding: LoadedBranding) => string;
  }
>;

export function resolveNativeIdentityLocale(locale: string): NativeIdentityLocale {
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function createAboutPanelOptions(
  branding: LoadedBranding,
  applicationVersion: string,
  platform: NodeJS.Platform,
  locale: NativeIdentityLocale,
): AboutPanelOptionsOptions {
  return {
    applicationName: branding.name,
    applicationVersion,
    credits: NATIVE_IDENTITY_COPY[locale].credits(branding),
    ...(platform === "darwin" ? {} : { iconPath: branding.appIconPath }),
  };
}

export function createMacApplicationMenuTemplate(
  applicationName: string,
  locale: NativeIdentityLocale,
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        { label: NATIVE_IDENTITY_COPY[locale].about(applicationName), role: "about" },
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
