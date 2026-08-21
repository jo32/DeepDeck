import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopChromeStyles = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../../plugins/desktop-chrome/src/client/desktop-chrome.module.css",
  ),
  "utf8",
);
const mainWindowSource = readFileSync(
  resolve(import.meta.dirname, "main-window.ts"),
  "utf8",
);
const desktopChromeSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../../plugins/desktop-chrome/src/client/DesktopChrome.tsx",
  ),
  "utf8",
);

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = desktopChromeStyles.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  expect(match, `missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("desktop titlebar hit testing", () => {
  it("hosts splash and Harness views without an intercepting BrowserWindow page", () => {
    expect(mainWindowSource).toContain("new BaseWindow(");
    expect(mainWindowSource).toContain(
      "window.contentView.addChildView(harnessView)",
    );
    expect(mainWindowSource).not.toContain("new BrowserWindow(");
  });

  it("keeps the full-width chrome overlay inert", () => {
    const chrome = rule(".chrome");

    expect(chrome).toContain("width: 100%");
    expect(chrome).toContain("pointer-events: none");
    expect(chrome).not.toContain("app-region: drag");
  });

  it("uses a dedicated blank strip as the native drag surface", () => {
    const dragRegion = rule(".dragRegion");
    expect(dragRegion).toContain("left: 114px");
    expect(dragRegion).toContain("pointer-events: auto");
    expect(dragRegion).toContain("app-region: drag");
    expect(dragRegion).toContain("-webkit-app-region: drag");
  });

  it("does not place a transparent drag overlay across an existing header", () => {
    expect(desktopChromeSource).toContain("sidebarWidth - SIDEBAR_DRAG_START");
    expect(desktopChromeSource).not.toContain("conversationDragRegion");
    expect(desktopChromeStyles).not.toContain(".conversationDragRegion");
  });

  it("lets static header chrome inherit one native drag region", () => {
    const header = rule(".frame .centerCol :global(header)");
    expect(header).toContain("app-region: drag");
    expect(header).toContain("-webkit-app-region: drag");
  });

  it("restores hit testing only for semantic header controls", () => {
    const interactiveControls = rule(
      ".frame .centerCol :global(header [data-window-interactive])",
    );
    expect(interactiveControls).toContain("app-region: no-drag");
    expect(interactiveControls).toContain("-webkit-app-region: no-drag");

    expect(desktopChromeStyles).toContain(
      ":global(header button:not(:disabled))",
    );
    expect(desktopChromeStyles).toContain(
      ":global(header [contenteditable]:not([contenteditable='false']))",
    );
    expect(desktopChromeStyles).toContain(
      ":global(header [draggable='true'])",
    );
    expect(desktopChromeStyles).toContain(
      ":global(header [role='treeitem']:not([aria-disabled='true']))",
    );
    expect(desktopChromeStyles).toContain(
      ":global(header [data-window-interactive])",
    );
    expect(desktopChromeStyles).not.toContain(
      ".frame .centerCol :global(header button) {",
    );
  });

  it("marks the rendered titlebar controls themselves as non-draggable", () => {
    const controls = rule(".controls");
    expect(controls).toContain("app-region: no-drag");
    expect(desktopChromeStyles).toContain("app-region: no-drag");
  });

  it("shows the collapsed-title divider only when a conversation exists", () => {
    expect(desktopChromeStyles).toContain(
      ".frame[data-sidebar-collapsed] .controls[data-has-conversation]::after",
    );
    expect(desktopChromeStyles).not.toContain(
      ".frame[data-sidebar-collapsed] .controls::after { display: block; }",
    );
  });
});
