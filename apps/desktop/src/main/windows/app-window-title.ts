const MAX_APP_WINDOW_TITLE_LENGTH = 120;

/** Normalize a plugin-owned document title before exposing it in native chrome. */
export function appWindowTitle(pageTitle: string, fallbackTitle: string): string {
  const normalized = pageTitle
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized.length === 0
    ? fallbackTitle
    : normalized.slice(0, MAX_APP_WINDOW_TITLE_LENGTH).trimEnd();
}
