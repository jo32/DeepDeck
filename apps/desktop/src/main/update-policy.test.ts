import { describe, expect, it } from "vitest";
import { shouldEnableDesktopUpdates } from "./update-policy.js";

describe("shouldEnableDesktopUpdates", () => {
  it("enables updates only for distributable packages", () => {
    expect(shouldEnableDesktopUpdates(false, false, {})).toBe(false);
    expect(shouldEnableDesktopUpdates(true, false, {})).toBe(true);
    expect(shouldEnableDesktopUpdates(true, true, {})).toBe(false);
    expect(shouldEnableDesktopUpdates(true, false, { DEEPDECK_LOCAL_BUILD: "1" })).toBe(false);
  });
});
