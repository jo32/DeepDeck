import { describe, expect, it } from "vitest";
import type { LoadedBranding } from "./branding.js";
import {
  createAboutPanelOptions,
  createMacApplicationMenuTemplate,
  resolveNativeIdentityLocale,
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
  it("localizes the About message in Chinese", () => {
    expect(createAboutPanelOptions(branding, "1.0.0", "darwin", "zh")).toEqual({
      applicationName: "DeepDeck",
      applicationVersion: "1.0.0",
      credits: "你的本地智能工作伙伴",
    });
  });

  it("localizes the About message in English", () => {
    expect(createAboutPanelOptions(branding, "1.0.0", "darwin", "en")).toEqual({
      applicationName: "DeepDeck",
      applicationVersion: "1.0.0",
      credits: "Your local AI work companion",
    });
  });

  it("uses the branded icon in About on platforms that support iconPath", () => {
    expect(createAboutPanelOptions(branding, "1.0.0", "win32", "en")).toMatchObject({
      applicationName: "DeepDeck",
      applicationVersion: "1.0.0",
      iconPath: "/branding/app-icon.png",
    });
  });

  it("localizes the explicit macOS About menu", () => {
    const english = createMacApplicationMenuTemplate("DeepDeck", "en");
    const chinese = createMacApplicationMenuTemplate("DeepDeck", "zh");
    expect(english[0]?.label).toBe("DeepDeck");
    expect(english[0]?.submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "About DeepDeck", role: "about" })]),
    );
    expect(chinese[0]?.submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "关于 DeepDeck", role: "about" })]),
    );
    expect(JSON.stringify([english, chinese])).not.toContain("Electron");
  });

  it("uses Chinese for every Chinese locale and English as the fallback", () => {
    expect(resolveNativeIdentityLocale("zh-CN")).toBe("zh");
    expect(resolveNativeIdentityLocale("zh-Hant")).toBe("zh");
    expect(resolveNativeIdentityLocale("en-US")).toBe("en");
    expect(resolveNativeIdentityLocale("ja-JP")).toBe("en");
  });
});
