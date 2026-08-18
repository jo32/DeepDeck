import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_FRAME_MOTION_RESUME_MS,
  scheduleDesktopFrameReveal,
} from "../../../plugins/desktop-chrome/src/client/desktop-runtime.ts";

const styles = readFileSync(
  new URL("../../../plugins/desktop-chrome/src/client/desktop-chrome.module.css", import.meta.url),
  "utf8",
);

describe("desktop frame startup handoff", () => {
  it("reveals the static Harness immediately and enables panel motion in the next task", () => {
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
      enableLayoutMotion,
      DESKTOP_FRAME_MOTION_RESUME_MS,
    );

    tasks.shift()?.();
    expect(enableLayoutMotion).toHaveBeenCalledOnce();
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
});
