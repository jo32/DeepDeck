import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  brandPageTitle,
  harnessBrandingCss,
  harnessBrandingScript,
  loadBranding,
  publicBranding,
} from "./branding.js";

const manifest = resolve(import.meta.dirname, "../../../../branding/brand.json");

describe("desktop branding", () => {
  it("loads the external manifest and embeds browser-safe assets", () => {
    const branding = loadBranding(manifest);

    expect(branding.name).toBe("OpenWorkBuddy");
    expect(branding.wordmarkDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(branding.markDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(branding.faviconDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(branding.appIconPath).toMatch(/branding\/app-icon\.png$/);
    expect(publicBranding(branding)).not.toHaveProperty("appIconPath");
    expect(publicBranding(branding)).not.toHaveProperty("upstreamName");
  });

  it("rewrites only the upstream product suffix", () => {
    const branding = loadBranding(manifest);

    expect(brandPageTitle("DeepSeek Harness", branding)).toBe("OpenWorkBuddy");
    expect(brandPageTitle("A session — DeepSeek Harness", branding)).toBe(
      "A session — OpenWorkBuddy",
    );
    expect(brandPageTitle("Unrelated page", branding)).toBe("Unrelated page");
  });

  it("builds a scoped inline-logo and document branding overlay", () => {
    const branding = loadBranding(manifest);
    const css = harnessBrandingCss(branding);
    const script = harnessBrandingScript(branding);

    expect(css).toContain('html[data-desktop-brand="openworkbuddy"]');
    expect(css).toContain('svg[viewBox="0 0 182 24"]');
    expect(css).toContain('svg[viewBox="0 0 23.16 17.04"]');
    expect(script).toContain("document.documentElement.dataset.desktopBrand");
    expect(script).toContain("OpenWorkBuddy");
  });
});
