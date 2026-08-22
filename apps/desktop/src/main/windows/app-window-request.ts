/**
 * Contract for the `deepdeck:open-app-window` Harness-child request.
 *
 * The Harness host process asks the desktop shell to promote one of its own
 * same-origin pages into a real secondary application window. Everything in
 * this module stays Electron-free so the Harness process layer and unit tests
 * can import it directly.
 */

export const APP_WINDOW_OPEN_REQUEST = "deepdeck:open-app-window";

export interface AppWindowOpenRequest {
  readonly type: typeof APP_WINDOW_OPEN_REQUEST;
  readonly url: string;
}

export function isAppWindowOpenRequest(message: unknown): message is AppWindowOpenRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { type?: unknown; url?: unknown };
  return candidate.type === APP_WINDOW_OPEN_REQUEST && typeof candidate.url === "string";
}

/**
 * Whether `candidate` may leave the Harness process as an app window: only
 * http(s) URLs whose origin equals the running Harness server's origin. This
 * keeps a compromised or buggy plugin from aiming the shell at arbitrary web
 * or file targets while still allowing every plugin-served page.
 */
export function isSameOriginHttpUrl(candidate: string, baseOrigin: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return url.origin === new URL(baseOrigin).origin;
  } catch {
    return false;
  }
}
