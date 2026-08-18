import { describe, expect, it, vi } from "vitest";
import {
  createMarketplaceRestartService,
  MARKETPLACE_RESTART_REQUEST,
} from "../../../plugins/marketplace-desktop-bridge/src/index.ts";

describe("Marketplace desktop restart bridge", () => {
  it("defers the IPC request so the Marketplace HTTP response can complete", () => {
    vi.useFakeTimers();
    const sent: unknown[] = [];
    const service = createMarketplaceRestartService((message) => {
      sent.push(message);
      return true;
    });

    expect(service.schedule()).toMatchObject({ helperPid: undefined });
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([{ type: MARKETPLACE_RESTART_REQUEST }]);
    vi.useRealTimers();
  });

  it("fails closed if the plugin is mounted outside a managed desktop child", () => {
    expect(() => createMarketplaceRestartService(null).schedule()).toThrow(
      /requires a Node IPC parent/,
    );
  });
});
