import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  launchMacUpdateHelper,
  resolveMacAppPath,
  resolveMacUpdateHelperPath,
} from "./update-relauncher.js";

describe("launchMacUpdateHelper", () => {
  it("resolves the application bundle from its macOS executable", () => {
    expect(resolveMacAppPath("/Applications/DeepDeck.app/Contents/MacOS/DeepDeck"))
      .toBe("/Applications/DeepDeck.app");
  });

  it("resolves the standalone helper from packaged resources", () => {
    expect(resolveMacUpdateHelperPath("/Applications/DeepDeck.app/Contents/Resources"))
      .toBe("/Applications/DeepDeck.app/Contents/Resources/deepdeck-update-helper");
  });

  it("passes values as direct executable arguments and detaches the helper", async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      unref: vi.fn(),
    }) as unknown as ChildProcess;
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }) as unknown as typeof spawn;

    await launchMacUpdateHelper({
      helperPath: "/Applications/DeepDeck.app/Contents/Resources/deepdeck-update-helper",
      appPath: "/Applications/Deep Deck.app",
      statePath: "/Users/test/Library/Application Support/DeepDeck/update-transaction.json",
      currentPid: 4321,
      sourceVersion: "1.0.2",
      targetVersion: "1.0.3",
      displayName: "DeepDeck",
      locale: "zh-CN",
      spawnProcess,
    });

    expect(spawnProcess).toHaveBeenCalledOnce();
    const [command, args, options] = vi.mocked(spawnProcess).mock.calls[0]!;
    expect(command).toBe("/Applications/DeepDeck.app/Contents/Resources/deepdeck-update-helper");
    expect(args).toEqual([
      "--parent-pid", "4321",
      "--app-path", "/Applications/Deep Deck.app",
      "--state-path", "/Users/test/Library/Application Support/DeepDeck/update-transaction.json",
      "--source-version", "1.0.2",
      "--target-version", "1.0.3",
      "--display-name", "DeepDeck",
      "--locale", "zh-CN",
    ]);
    expect(options).toMatchObject({ detached: true, stdio: "ignore" });
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("rejects when the helper executable cannot start", async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ChildProcess;
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit("error", new Error("permission denied")));
      return child;
    }) as unknown as typeof spawn;

    await expect(launchMacUpdateHelper({
      helperPath: "/missing/helper",
      appPath: "/Applications/DeepDeck.app",
      statePath: "/tmp/update.json",
      currentPid: 1,
      sourceVersion: "1.0.2",
      targetVersion: "1.0.3",
      displayName: "DeepDeck",
      locale: "en",
      spawnProcess,
    })).rejects.toThrow("permission denied");
    expect(child.unref).not.toHaveBeenCalled();
  });
});
