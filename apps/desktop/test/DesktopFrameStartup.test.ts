import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_FRAME_MOTION_RESUME_MS,
  scheduleDesktopFrameReveal,
} from "../../../plugins/desktop-chrome/src/client/desktop-runtime.ts";
import {
  BrandCompositionController,
} from "../../../plugins/desktop-chrome/src/client/brand-composition.ts";

const styles = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/desktop-chrome.module.css", import.meta.url),
  "utf8",
);
const frameSource = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/AppFrame.tsx", import.meta.url),
  "utf8",
);

describe("desktop frame startup handoff", () => {
  it("reveals immediately and repeats readiness after the navigation settle point", () => {
    const tasks: Array<() => void> = [];
    const scheduleTask = vi.fn((callback: () => void, _delayMs: number) => {
      tasks.push(callback);
      return tasks.length;
    });
    const cancelTask = vi.fn();
    const notifyReady = vi.fn();
    const enableLayoutMotion = vi.fn();
    scheduleDesktopFrameReveal(
      enableLayoutMotion,
      notifyReady,
      scheduleTask,
      cancelTask,
    );

    expect(notifyReady).toHaveBeenCalledOnce();
    expect(enableLayoutMotion).not.toHaveBeenCalled();
    expect(scheduleTask).toHaveBeenCalledWith(
      expect.any(Function),
      DESKTOP_FRAME_MOTION_RESUME_MS,
    );

    tasks.shift()?.();
    expect(enableLayoutMotion).toHaveBeenCalledOnce();
    expect(notifyReady).toHaveBeenCalledTimes(2);
  });

  it("keeps the initial grid static while preserving later user-driven transitions", () => {
    const initialFrameRule = styles.match(/\.frame\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(initialFrameRule).not.toContain("transition:");
    expect(styles).toMatch(
      /\.frame\[data-layout-motion-ready\]\s*\{[\s\S]*?transition: grid-template-columns/,
    );
    expect(styles).toMatch(
      /\.frame\[data-layout-motion-ready\] \.handle\s*\{[\s\S]*?transition: left/,
    );
  });

  it("publishes the committed branded composition exactly once", () => {
    const composition = new BrandCompositionController();
    const listener = vi.fn();
    const unsubscribe = composition.subscribe(listener);

    expect(composition.isReady()).toBe(false);
    composition.markReady();
    composition.markReady();
    expect(composition.isReady()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
  });

  it("waits for the committed branded composition before revealing Harness", () => {
    expect(frameSource).toContain("useSyncExternalStore(");
    expect(frameSource).toContain("if (!brandCompositionReady) return");
    expect(frameSource).toContain("scheduleDesktopFrameReveal(");
  });
});
