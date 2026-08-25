import { describe, expect, it, vi } from "vitest";
import {
  HarnessViewReveal,
  type HarnessViewRevealDriver,
} from "./harness-view-reveal.js";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: () => void;
} {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = () => { rejectPromise(new Error("capture failed")); };
  });
  return { promise, resolve, reject };
}

function fixture(capture: Promise<void>): {
  reveal: HarnessViewReveal;
  driver: HarnessViewRevealDriver;
} {
  const driver: HarnessViewRevealDriver = {
    stage: vi.fn(),
    capture: vi.fn(() => capture),
    reveal: vi.fn(),
    conceal: vi.fn(),
  };
  return { reveal: new HarnessViewReveal(driver), driver };
}

describe("HarnessViewReveal", () => {
  it("keeps the splash above Harness until the staged frame is captured", async () => {
    const frame = deferred();
    const { reveal, driver } = fixture(frame.promise);

    reveal.request();
    reveal.request();
    expect(driver.stage).toHaveBeenCalledOnce();
    expect(driver.capture).toHaveBeenCalledOnce();
    expect(driver.reveal).not.toHaveBeenCalled();

    frame.resolve();
    await frame.promise;
    await Promise.resolve();
    expect(driver.reveal).toHaveBeenCalledOnce();

    reveal.request();
    expect(driver.stage).toHaveBeenCalledOnce();
  });

  it("invalidates an in-flight frame when navigation restores the splash", async () => {
    const frame = deferred();
    const { reveal, driver } = fixture(frame.promise);

    reveal.request();
    reveal.conceal();
    frame.resolve();
    await frame.promise;
    await Promise.resolve();

    expect(driver.conceal).toHaveBeenCalledOnce();
    expect(driver.reveal).not.toHaveBeenCalled();
  });

  it("fails open when native capture is unavailable", async () => {
    const frame = deferred();
    const { reveal, driver } = fixture(frame.promise);

    reveal.request();
    frame.reject();
    await expect(frame.promise).rejects.toThrow("capture failed");
    await Promise.resolve();
    await Promise.resolve();

    expect(driver.reveal).toHaveBeenCalledOnce();
  });
});
