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

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = desktopChromeStyles.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  expect(match, `missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("desktop titlebar hit testing", () => {
  it("keeps the chrome overlay away from session header actions", () => {
    const chrome = rule(".chrome");

    expect(chrome).toContain("width: 144px");
    expect(chrome).toContain("app-region: drag");
    expect(chrome).toContain("-webkit-app-region: drag");
    expect(chrome).not.toContain("right: 0");
  });

  it("extends the drag surface across a blank session", () => {
    expect(rule(".chrome:not([data-has-conversation])")).toContain(
      "width: 100%",
    );
  });

  it("lets the header drag while preserving clickable buttons", () => {
    expect(rule(".frame .centerCol :global(header)")).toContain(
      "app-region: drag",
    );
    expect(rule(".frame .centerCol :global(header)")).toContain(
      "-webkit-app-region: drag",
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
