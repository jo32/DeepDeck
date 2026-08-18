import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import {
  isDesktopThemeSource,
  type DesktopThemeSource,
} from "../shared/theme.js";

const DEFAULT_THEME_SOURCE: DesktopThemeSource = "system";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function themeSourceFromSettings(settings: unknown): DesktopThemeSource {
  if (!isRecord(settings)) return DEFAULT_THEME_SOURCE;
  const section = settings["ui-theme"];
  if (!isRecord(section)) return DEFAULT_THEME_SOURCE;
  const preference = section.preference;
  return isDesktopThemeSource(preference) ? preference : DEFAULT_THEME_SOURCE;
}

/** Read the theme preference Harness will adopt, without creating another store. */
export async function readThemeSource(dshHome: string): Promise<DesktopThemeSource> {
  try {
    const source = await readFile(join(dshHome, "settings.yaml"), "utf8");
    return themeSourceFromSettings(parse(source));
  } catch {
    // A missing or malformed settings file must never prevent the splash from loading.
    return DEFAULT_THEME_SOURCE;
  }
}
