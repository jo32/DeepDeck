/**
 * Contract for the `deepdeck:open-app-window` Harness-child request.
 *
 * The Harness host process asks the desktop shell to promote one of its own
 * same-origin pages into a real secondary application window. Everything in
 * this module stays Electron-free so the Harness process layer and unit tests
 * can import it directly.
 */

export const APP_WINDOW_OPEN_REQUEST = "deepdeck:open-app-window";
export const APP_MAIN_WINDOW_FOCUS_REQUEST = "deepdeck:focus-main-window";
export const APP_WINDOWS_RELOAD_REQUEST = "deepdeck:reload-app-windows";
export const APP_WINDOWS_RELOAD_RESULT = "deepdeck:reload-app-windows-result";

export interface AppWindowOpenRequest {
  readonly type: typeof APP_WINDOW_OPEN_REQUEST;
  readonly url: string;
}

export interface AppMainWindowFocusRequest {
  readonly type: typeof APP_MAIN_WINDOW_FOCUS_REQUEST;
}

export interface AppWindowsReloadRequest {
  readonly type: typeof APP_WINDOWS_RELOAD_REQUEST;
  readonly requestId: string;
  readonly path: string;
}

export interface AppWindowsReloadResult {
  readonly type: typeof APP_WINDOWS_RELOAD_RESULT;
  readonly requestId: string;
  readonly reloaded: number;
  readonly error?: string;
}

export function isAppWindowOpenRequest(message: unknown): message is AppWindowOpenRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { type?: unknown; url?: unknown };
  return candidate.type === APP_WINDOW_OPEN_REQUEST && typeof candidate.url === "string";
}

export function isAppMainWindowFocusRequest(message: unknown): message is AppMainWindowFocusRequest {
  if (typeof message !== "object" || message === null) return false;
  return (message as { type?: unknown }).type === APP_MAIN_WINDOW_FOCUS_REQUEST;
}

export function isAppWindowsReloadRequest(message: unknown): message is AppWindowsReloadRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { type?: unknown; requestId?: unknown; path?: unknown };
  if (
    candidate.type !== APP_WINDOWS_RELOAD_REQUEST
    || typeof candidate.requestId !== "string"
    || candidate.requestId.length === 0
    || candidate.requestId.length > 128
    || typeof candidate.path !== "string"
  ) return false;
  try {
    const parsed = new URL(candidate.path, "http://deepdeck.local");
    return candidate.path.startsWith("/")
      && !candidate.path.startsWith("//")
      && parsed.origin === "http://deepdeck.local"
      && parsed.pathname === candidate.path
      && parsed.search.length === 0
      && parsed.hash.length === 0;
  } catch {
    return false;
  }
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
