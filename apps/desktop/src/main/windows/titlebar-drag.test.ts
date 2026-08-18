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

  it("keeps the chrome overlay away from session header actions", () => {
    const chrome = rule(".chrome");

    expect(chrome).toContain("width: 150px");
    expect(chrome).not.toContain("app-region: drag");
    expect(chrome).not.toContain("right: 0");
  });

  it("uses a dedicated blank strip as the native drag surface", () => {
    const dragRegion = rule(".dragRegion");
    expect(dragRegion).toContain("left: 114px");
    expect(dragRegion).toContain("app-region: drag");
    expect(dragRegion).toContain("-webkit-app-region: drag");
  });

  it("extends the drag surface across a blank session", () => {
    expect(rule(".chrome:not([data-has-conversation])")).toContain(
      "width: 100%",
    );
  });

  it("keeps the conversation header and its buttons non-draggable", () => {
    expect(rule(".frame .centerCol :global(header)")).toContain(
      "app-region: no-drag",
    );
    expect(rule(".frame .centerCol :global(header)")).toContain(
      "-webkit-app-region: no-drag",
    );
    expect(rule(".frame .centerCol :global(header button)")).toContain(
      "app-region: no-drag",
    );
    expect(rule(".frame .centerCol :global(header button)")).toContain(
      "-webkit-app-region: no-drag",
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
