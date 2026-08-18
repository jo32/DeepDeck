import { describe, expect, it } from "vitest";
import {
  isMarketplaceRestartRequest,
  MARKETPLACE_RESTART_REQUEST,
} from "./harness-process.js";

describe("Marketplace restart IPC", () => {
  it("accepts only the named restart request", () => {
    expect(isMarketplaceRestartRequest({ type: MARKETPLACE_RESTART_REQUEST })).toBe(true);
    expect(isMarketplaceRestartRequest({ type: "other" })).toBe(false);
    expect(isMarketplaceRestartRequest(null)).toBe(false);
    expect(isMarketplaceRestartRequest(MARKETPLACE_RESTART_REQUEST)).toBe(false);
  });
});
