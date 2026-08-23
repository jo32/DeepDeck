import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/DesktopSidebar.tsx", import.meta.url),
  "utf8",
);
const sidebarContract = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/sidebar-contract.d.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/index.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/desktop-chrome.module.css", import.meta.url),
  "utf8",
);

describe("DesktopSidebar Apps navigation", () => {
  it("declares a list capability for installed app plugins", () => {
    expect(sidebarContract).toMatch(/'sidebar\.apps':\s*\{[\s\S]*?kind: 'list'[\s\S]*?scope: 'root'/);
    expect(sidebarContract).toContain("owner: DesktopAppNavigationOwnerProps");
    expect(client).toContain("'sidebar.apps': { kind: 'list', scope: 'root' }");
    expect(client).toContain("ctx.slots.subscribe('sidebar.apps', listener)");
  });

  it("shows one Apps launcher only while app entries are registered", () => {
    expect(sidebar).toContain("useSyncExternalStore(apps.subscribe, apps.version, apps.version)");
    expect(sidebar).toContain("const hasApps = appCount > 0");
    expect(sidebar).toContain("{hasApps && (");
    expect(sidebar).toContain("className={css.sidebarAppsLauncher}");
    expect(sidebar).toContain('aria-haspopup="dialog"');
    expect(sidebar).toContain("setAppsOpen(true)");
  });

  it("opens a bounded app list before navigating to a concrete app", () => {
    expect(sidebar).toContain("{hasApps && appsOpen && (");
    expect(sidebar).toContain('role="dialog"');
    expect(sidebar).toContain("renderSlot('sidebar.apps', {");
    expect(sidebar).toContain("closeApps: () => { setAppsOpen(false) }");
    expect(styles).toMatch(/\.sidebarAppsPanel\s*\{[\s\S]*?width: min\(440px, 100%\)/);
    expect(styles).toMatch(/\.sidebarAppsList\s*\{[\s\S]*?overflow-y: auto/);
  });
});
