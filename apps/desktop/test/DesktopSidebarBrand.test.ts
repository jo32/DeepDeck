import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/DesktopSidebar.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/desktop-chrome.module.css", import.meta.url),
  "utf8",
);
const mark = readFileSync(
  new URL("../../../branding/mark.svg", import.meta.url),
  "utf8",
);

describe("DesktopSidebar brand", () => {
  it("keeps the fixed-color mark beside a theme-colored brand name", () => {
    expect(sidebar).toContain("data-openworkbuddy-brand-mark");
    expect(sidebar).toContain("src={BRAND.markDataUrl}");
    expect(sidebar).not.toContain("maskImage:");
    expect(sidebar).toContain("data-openworkbuddy-brand-name");
    expect(sidebar).toContain("{BRAND.name}");
    expect(sidebar).not.toContain("BRAND.wordmarkDataUrl");

    expect(styles).toMatch(/\.sidebarBrand\s*\{[\s\S]*?color: var\(--dsw-alias-label-primary\)/);
    expect(styles).not.toMatch(/\.sidebarBrandMark\s*\{[\s\S]*?background: currentColor/);
    expect(styles).toMatch(/:global\(body\[data-ds-dark-theme\]\) \.sidebarBrandMark\s*\{\s*filter: invert\(1\)/);
  });

  it("preserves the supplied black orb and rotated white ellipse eyes", () => {
    expect(mark).toContain('viewBox="0 0 1024 1024"');
    expect(mark).toContain('circle cx="512" cy="512" r="360" fill="#000000"');
    expect(mark).toContain('fill="#ffffff"');
    expect(mark).toContain('transform="rotate(-18 370 500)"');
    expect(mark).toContain('transform="rotate(18 654 500)"');
    expect(mark.match(/<circle\b/g)).toHaveLength(1);
    expect(mark.match(/<ellipse\b/g)).toHaveLength(2);
  });
});
