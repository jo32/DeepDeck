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
const brand = JSON.parse(readFileSync(
  new URL("../../../branding/brand.json", import.meta.url),
  "utf8",
)) as { attribution?: unknown };

describe("DesktopSidebar brand", () => {
  it("keeps the fixed-color mark beside a theme-colored brand name", () => {
    expect(sidebar).toContain("data-deepdeck-brand-mark");
    expect(sidebar).toContain("src={BRAND.markDataUrl}");
    expect(sidebar).not.toContain("maskImage:");
    expect(sidebar).toContain("data-deepdeck-brand-name");
    expect(sidebar).toContain("{BRAND.name}");
    expect(sidebar).toContain("data-deepdeck-brand-attribution");
    expect(sidebar).toContain("{BRAND.attribution}");
    expect(sidebar).not.toContain("BRAND.wordmarkDataUrl");

    expect(styles).toMatch(/\.sidebarBrand\s*\{[\s\S]*?color: var\(--dsw-alias-label-primary\)/);
    expect(styles).toMatch(/\.sidebarBrand\s*\{[\s\S]*?grid-template-columns: 24px minmax\(0, 1fr\)/);
    expect(styles).toMatch(/\.sidebarBrand\s*\{[\s\S]*?grid-template-rows: 24px 14px/);
    expect(styles).toMatch(/\.sidebarBrand\s*\{[\s\S]*?text-align: left/);
    expect(styles).toMatch(/\.sidebarBrandMark\s*\{[\s\S]*?grid-row: 1/);
    expect(styles).toMatch(/\.sidebarBrandName\s*\{[\s\S]*?grid-row: 1[\s\S]*?line-height: 24px/);
    expect(styles).toMatch(/\.sidebarBrandAttribution\s*\{[\s\S]*?grid-row: 2/);
    expect(styles).toMatch(/\.sidebarBrandAttribution\s*\{[\s\S]*?font-size: 10px/);
    expect(styles).not.toMatch(/\.sidebarBrandMark\s*\{[\s\S]*?background: currentColor/);
    expect(styles).toMatch(/:global\(body\[data-ds-dark-theme\]\) \.sidebarBrandMark\s*\{\s*filter: invert\(1\)/);
    expect(brand.attribution).toBe("DeepSeek Harness Desktop");
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
