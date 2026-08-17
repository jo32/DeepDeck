import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBranding, publicBranding } from "./branding.js";

const manifest = resolve(import.meta.dirname, "../../../../branding/brand.json");

describe("desktop branding", () => {
  it("loads only native-window and splash branding", () => {
    const branding = loadBranding(manifest);

    expect(branding.name).toBe("OpenWorkBuddy");
    expect(branding.markDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(branding.appIconPath).toMatch(/branding\/app-icon\.png$/);
    expect(publicBranding(branding)).not.toHaveProperty("appIconPath");
    expect(publicBranding(branding)).not.toHaveProperty("upstreamName");
    expect(publicBranding(branding)).not.toHaveProperty("wordmarkDataUrl");
    expect(publicBranding(branding)).not.toHaveProperty("faviconDataUrl");
  });
});
