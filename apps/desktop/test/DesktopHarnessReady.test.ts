import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyDesktopFrameReady } from "../../../plugins/desktop-chrome/src/client/desktop-runtime.ts";

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
});
