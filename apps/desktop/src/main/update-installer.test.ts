import { describe, expect, it, vi } from "vitest";
import type { DesktopUpdateStatus } from "../shared/update.js";
import { createAutomaticUpdateInstaller } from "./update-installer.js";

const available: DesktopUpdateStatus = {
  state: "available",
  currentVersion: "1.0.0",
  version: "1.1.0",
};

describe("createAutomaticUpdateInstaller", () => {
  it("ignores updates that have not finished downloading", async () => {
    const updates = { quitAndInstall: vi.fn() };
    const prepareToQuit = vi.fn(async () => {});
    const install = createAutomaticUpdateInstaller(updates, prepareToQuit);

    await install(available);

    expect(prepareToQuit).not.toHaveBeenCalled();
    expect(updates.quitAndInstall).not.toHaveBeenCalled();
  });

  it("stops the runtime once before automatically restarting into the update", async () => {
    const order: string[] = [];
    let finishStopping: (() => void) | undefined;
    const updates = {
      quitAndInstall: vi.fn(() => { order.push("install"); }),
    };
    const prepareToQuit = vi.fn(() => new Promise<void>((resolve) => {
      order.push("stop");
      finishStopping = resolve;
    }));
    const install = createAutomaticUpdateInstaller(updates, prepareToQuit);
    const downloaded: DesktopUpdateStatus = {
      ...available,
      state: "downloaded",
      percent: 100,
    };

    const first = install(downloaded);
    const duplicate = install(downloaded);
    expect(order).toEqual(["stop"]);
    expect(prepareToQuit).toHaveBeenCalledOnce();

    finishStopping?.();
    await Promise.all([first, duplicate]);

    expect(order).toEqual(["stop", "install"]);
    expect(updates.quitAndInstall).toHaveBeenCalledOnce();
  });
});
