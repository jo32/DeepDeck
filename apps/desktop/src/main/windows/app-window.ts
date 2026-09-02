import { BaseWindow, WebContentsView } from "electron";
import type { AppWindowReloadReceipt } from "./app-window-request.js";
import {
  appWindowRecoveryRoute,
  appWindowRecoveryUrl,
  sameAppWindowRoute,
} from "./app-window-recovery.js";
import { appWindowTitle } from "./app-window-title.js";

/**
 * Secondary application windows requested by the Harness child.
 *
 * These windows host plain plugin-served documents (no desktop preload, no
 * splash gate): the requesting plugin owns the whole page. Windows are kept
 * keyed by URL so repeated requests focus the existing window instead of
 * stacking duplicates.
 */
export interface AppWindowManager {
  open(url: string): void;
  reload(url: string): Promise<AppWindowReloadReceipt>;
  snapshot(baseUrl: string): readonly string[];
  restore(baseUrl: string, routes: readonly string[]): Promise<AppWindowReloadReceipt>;
  dispose(): void;
}

const DEFAULT_WIDTH = 1240;
const DEFAULT_HEIGHT = 840;
const RELOAD_TIMEOUT_MS = 15_000;

export function createAppWindowManager(displayName: string): AppWindowManager {
  const windows = new Set<BaseWindow>();
  const views = new Map<BaseWindow, WebContentsView>();

  const syncBounds = (window: BaseWindow, view: WebContentsView): void => {
    if (window.isDestroyed()) return;
    const [width = 0, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
  };

  const navigate = async (
    window: BaseWindow,
    view: WebContentsView,
    url: string,
  ): Promise<boolean> => await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (loaded: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      view.webContents.removeListener("did-finish-load", loadedPage);
      view.webContents.removeListener("did-fail-load", failedPage);
      if (loaded && !window.isDestroyed()) {
        window.show();
        syncBounds(window, view);
      }
      resolve(loaded);
    };
    const loadedPage = (): void => finish(true);
    const failedPage = (): void => finish(false);
    const timeout = setTimeout(() => finish(false), RELOAD_TIMEOUT_MS);
    view.webContents.once("did-finish-load", loadedPage);
    view.webContents.once("did-fail-load", failedPage);
    void view.webContents.loadURL(url).catch(() => finish(false));
  });

  const createWindow = (url: string): Promise<boolean> => {
    const window = new BaseWindow({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      minWidth: 720,
      minHeight: 520,
      show: false,
      title: displayName,
      backgroundColor: "#171717",
      autoHideMenuBar: true,
    });
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.contentView.addChildView(view);
    view.webContents.on("page-title-updated", (event, title) => {
      event.preventDefault();
      if (!window.isDestroyed()) window.setTitle(appWindowTitle(title, displayName));
    });
    syncBounds(window, view);
    window.on("resize", () => syncBounds(window, view));
    window.once("closed", () => {
      views.delete(window);
      windows.delete(window);
    });
    windows.add(window);
    views.set(window, view);
    return navigate(window, view, url).then((loaded) => {
      if (!loaded && !window.isDestroyed()) window.destroy();
      return loaded;
    });
  };

  return {
    open(url: string): void {
      for (const [window, view] of views) {
        if (window.isDestroyed()) continue;
        if (view.webContents.getURL() === url) {
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
          return;
        }
      }
      void createWindow(url);
    },
    async reload(url: string): Promise<AppWindowReloadReceipt> {
      const target = new URL(url);
      const candidates = [...views].filter(([window, view]) => {
        if (window.isDestroyed() || view.webContents.isDestroyed()) return false;
        try {
          const current = new URL(view.webContents.getURL());
          return current.origin === target.origin && current.pathname === target.pathname;
        } catch {
          return false;
        }
      });
      const results = await Promise.all(candidates.map(async ([window, view]) => await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (loaded: boolean): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          view.webContents.removeListener("did-finish-load", loadedPage);
          view.webContents.removeListener("did-fail-load", failedPage);
          if (loaded && !window.isDestroyed()) syncBounds(window, view);
          resolve(loaded);
        };
        const loadedPage = (): void => finish(true);
        const failedPage = (): void => finish(false);
        const timeout = setTimeout(() => finish(false), RELOAD_TIMEOUT_MS);
        view.webContents.once("did-finish-load", loadedPage);
        view.webContents.once("did-fail-load", failedPage);
        view.webContents.reloadIgnoringCache();
      })));
      const reloaded = results.filter(Boolean).length;
      return Object.freeze({
        matched: results.length,
        reloaded,
        failed: results.length - reloaded,
      });
    },
    snapshot(baseUrl: string): readonly string[] {
      const routes = new Set<string>();
      for (const [window, view] of views) {
        if (window.isDestroyed() || view.webContents.isDestroyed()) continue;
        const route = appWindowRecoveryRoute(view.webContents.getURL(), baseUrl);
        if (route !== undefined) routes.add(route);
      }
      return Object.freeze([...routes]);
    },
    async restore(baseUrl: string, routes: readonly string[]): Promise<AppWindowReloadReceipt> {
      const uniqueRoutes = [...new Set(routes)];
      const results = await Promise.all(uniqueRoutes.map(async (route) => {
        const target = appWindowRecoveryUrl(baseUrl, route);
        if (target === undefined) return false;
        const existing = [...views].find(([window, view]) => (
          !window.isDestroyed()
          && !view.webContents.isDestroyed()
          && sameAppWindowRoute(view.webContents.getURL(), route)
        ));
        if (existing === undefined) return await createWindow(target);
        return await navigate(existing[0], existing[1], target);
      }));
      const reloaded = results.filter(Boolean).length;
      return Object.freeze({
        matched: uniqueRoutes.length,
        reloaded,
        failed: uniqueRoutes.length - reloaded,
      });
    },
    dispose(): void {
      for (const window of [...windows]) {
        if (!window.isDestroyed()) window.destroy();
      }
      windows.clear();
      views.clear();
    },
  };
}
