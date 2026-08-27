import { describe, expect, it, vi } from "vitest";
import {
  createDesktopTelemetry,
  parseEmbeddedTelemetryConfig,
  resolveTelemetryScreen,
} from "./vibeloft-telemetry.js";

const config = {
  productId: "e3e05646-24b9-4532-9068-d8f29cad72f3",
  appId: "com.jo32.deepdeck",
  authKey: `vl_native.${"a".repeat(43)}`,
};

describe("VibeLoft desktop telemetry", () => {
  it("accepts only the embedded DeepDeck identity", () => {
    expect(parseEmbeddedTelemetryConfig(config)).toEqual(config);
    expect(parseEmbeddedTelemetryConfig({ ...config, appId: "com.example.other" })).toBeUndefined();
    expect(parseEmbeddedTelemetryConfig({ ...config, authKey: "vl_web.not-native" })).toBeUndefined();
  });

  it("maps only stable screen enums", () => {
    expect(resolveTelemetryScreen("home")).toBe("/home");
    expect(resolveTelemetryScreen("apps")).toBe("/apps");
    expect(resolveTelemetryScreen("/search?q=private")).toBeUndefined();
  });

  it("keeps SDK access in main and rejects arbitrary renderer values", async () => {
    const trackScreen = vi.fn();
    const close = vi.fn(async () => {});
    const createClient = vi.fn(async () => ({ trackScreen, close }));
    const runtime = await createDesktopTelemetry({
      getPath: () => "/tmp/deepdeck-test",
      getLocale: () => "en-US",
    }, { config, createClient });

    expect(runtime.enabled).toBe(true);
    expect(runtime.trackScreen("home")).toBe(true);
    expect(runtime.trackScreen("user/joe@example.com")).toBe(false);
    expect(trackScreen).toHaveBeenCalledOnce();
    expect(trackScreen).toHaveBeenCalledWith("/home");
    await runtime.close();
    expect(close).toHaveBeenCalledWith({ flushPending: true });
  });
});
