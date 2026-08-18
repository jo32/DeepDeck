import { describe, expect, it } from "vitest";
import type { LoadedBranding } from "./branding.js";
import {
  createAboutPanelOptions,
  createMacApplicationMenuTemplate,
} from "./native-identity-model.js";

const branding = {
  id: "deepdeck",
  name: "DeepDeck",
  tagline: "你的本地智能工作伙伴",
  accentColor: "#635BFF",
  accentColorSoft: "#EEEAFE",
  markDataUrl: "data:image/svg+xml;base64,AA==",
  appIconPath: "/branding/app-icon.png",
} satisfies LoadedBranding;

describe("native DeepDeck identity", () => {
  it("overrides every textual About value that Electron would otherwise supply", () => {
    expect(createAboutPanelOptions(branding, "1.0.0", "darwin")).toEqual({
      applicationName: "DeepDeck",
      applicationVersion: "1.0.0",
      credits: "你的本地智能工作伙伴",
    });
  });

  it("uses the branded icon in About on platforms that support iconPath", () => {
    expect(createAboutPanelOptions(branding, "1.0.0", "win32")).toMatchObject({
      applicationName: "DeepDeck",
      applicationVersion: "1.0.0",
      iconPath: "/branding/app-icon.png",
    });
  });

  it("builds an explicit About DeepDeck application menu", () => {
    const template = createMacApplicationMenuTemplate("DeepDeck");
    expect(template[0]?.label).toBe("DeepDeck");
    expect(template[0]?.submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "About DeepDeck", role: "about" })]),
    );
    expect(JSON.stringify(template)).not.toContain("Electron");
  });
});
