export const POPUP_PLACEHOLDER_URL = "about:blank";

export function isExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isPopupPlaceholder(value: string): boolean {
  return value === POPUP_PLACEHOLDER_URL;
}
