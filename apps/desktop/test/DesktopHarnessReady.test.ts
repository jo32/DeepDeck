import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyDesktopFrameReady,
  trackDesktopScreen,
} from "../../../plugins/desktop-chrome/src/client/desktop-runtime.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "deepseekDesktop");
});

describe("desktop Harness readiness bridge", () => {
  it("signals Electron only when the desktop runtime bridge is present", () => {
    expect(() => notifyDesktopFrameReady()).not.toThrow();

    const readyForDisplay = vi.fn();
    Object.defineProperty(globalThis, "deepseekDesktop", {
      configurable: true,
      value: { runtime: { readyForDisplay } },
    });

    notifyDesktopFrameReady();
    expect(readyForDisplay).toHaveBeenCalledOnce();
  });

  it("sends only stable telemetry screen enums through the desktop bridge", async () => {
    const screen = vi.fn(async () => true);
    Object.defineProperty(globalThis, "deepseekDesktop", {
      configurable: true,
      value: { telemetry: { screen } },
    });

    trackDesktopScreen("apps");
    await Promise.resolve();
    expect(screen).toHaveBeenCalledWith("apps");
  });
});
