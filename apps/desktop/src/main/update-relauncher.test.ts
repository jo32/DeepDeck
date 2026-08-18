import type { ChildProcess, spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { armMacUpdateRelaunch, resolveMacAppPath } from "./update-relauncher.js";

describe("armMacUpdateRelaunch", () => {
  it("resolves the application bundle from its macOS executable", () => {
    expect(resolveMacAppPath("/Applications/DeepDeck.app/Contents/MacOS/DeepDeck"))
      .toBe("/Applications/DeepDeck.app");
  });

  it("passes untrusted values as positional arguments and detaches the watcher", () => {
    const child = { unref: vi.fn() } as unknown as ChildProcess;
    const spawnProcess = vi.fn(() => child) as unknown as typeof spawn;

    armMacUpdateRelaunch({
      appPath: "/Applications/Deep Deck.app",
      currentPid: 4321,
      targetVersion: "1.0.3",
      spawnProcess,
    });

    expect(spawnProcess).toHaveBeenCalledOnce();
    const [command, args, options] = vi.mocked(spawnProcess).mock.calls[0]!;
    expect(command).toBe("/bin/sh");
    expect(args?.slice(-4)).toEqual([
      "deepdeck-update-relauncher",
      "4321",
      "/Applications/Deep Deck.app",
      "1.0.3",
    ]);
    expect(options).toMatchObject({ detached: true, stdio: "ignore" });
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
