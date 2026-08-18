import { describe, expect, it } from "vitest";
import { shouldEnableDesktopUpdates } from "./update-policy.js";

describe("shouldEnableDesktopUpdates", () => {
  it("enables updates only for distributable packages", () => {
    expect(shouldEnableDesktopUpdates(false, {})).toBe(false);
    expect(shouldEnableDesktopUpdates(true, {})).toBe(true);
    expect(shouldEnableDesktopUpdates(true, { DEEPDECK_LOCAL_BUILD: "1" })).toBe(false);
  });
});
