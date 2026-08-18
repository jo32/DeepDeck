import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = resolve(import.meta.dirname, "../src/renderer");
const indexHtml = readFileSync(resolve(rendererRoot, "index.html"), "utf8");
const styles = readFileSync(resolve(rendererRoot, "styles.css"), "utf8");

describe("desktop splash dark mode", () => {
  it("advertises both supported color schemes", () => {
    expect(indexHtml).toContain('name="color-scheme" content="light dark"');
  });

  it("defines a complete dark palette selected by the native color scheme", () => {
    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toContain("--splash-page-bg: #151517");
    expect(styles).toContain("--splash-sidebar-bg: #1b1b1c");
    expect(styles).toContain("--skeleton-base: #29292b");
    expect(styles).toContain("color: var(--splash-text)");
    expect(styles).toContain("background: var(--splash-shell-bg)");
  });
});
