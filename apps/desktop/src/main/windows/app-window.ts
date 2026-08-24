import { BaseWindow, WebContentsView } from "electron";

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
  reload(url: string): Promise<number>;
  dispose(): void;
}

const DEFAULT_WIDTH = 1240;
const DEFAULT_HEIGHT = 840;
const RELOAD_TIMEOUT_MS = 15_000;

export function createAppWindowManager(): AppWindowManager {
  const windows = new Set<BaseWindow>();
  const views = new Map<BaseWindow, WebContentsView>();

  const syncBounds = (window: BaseWindow, view: WebContentsView): void => {
    if (window.isDestroyed()) return;
    const [width = 0, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
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

      const window = new BaseWindow({
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        minWidth: 720,
        minHeight: 520,
        show: false,
        title: "DeepDeck",
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
      // WebContentsView defaults to zero-sized bounds; size it before the
      // first paint instead of waiting for the first resize event.
      syncBounds(window, view);
      window.on("resize", () => syncBounds(window, view));
      window.once("closed", () => {
        views.delete(window);
        windows.delete(window);
      });
      view.webContents.once("did-finish-load", () => {
        if (window.isDestroyed()) return;
        window.show();
        // BaseWindow can report a zero content size before its first show on
        // macOS. Re-apply the viewport after promotion so a loaded app page
        // cannot remain hidden behind the window background.
        syncBounds(window, view);
      });
      windows.add(window);
      views.set(window, view);
      void view.webContents.loadURL(url).catch(() => {
        if (!window.isDestroyed()) window.destroy();
      });
    },
    async reload(url: string): Promise<number> {
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
      return results.filter(Boolean).length;
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
