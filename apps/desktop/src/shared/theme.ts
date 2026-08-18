export const DESKTOP_THEME_SOURCES = ["light", "dark", "system"] as const;

export type DesktopThemeSource = (typeof DESKTOP_THEME_SOURCES)[number];

export function isDesktopThemeSource(value: unknown): value is DesktopThemeSource {
  return DESKTOP_THEME_SOURCES.some((source) => source === value);
}

export interface DesktopAppearanceApi {
  setThemeSource(source: DesktopThemeSource): Promise<void>;
}
