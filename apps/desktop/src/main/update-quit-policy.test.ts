import { describe, expect, it } from "vitest";
import { shouldForceExitForUpdate } from "./update-quit-policy.js";

describe("shouldForceExitForUpdate", () => {
  it("forces a direct process exit only after update cleanup is complete", () => {
    expect(shouldForceExitForUpdate(true, "1.0.5")).toBe(true);
    expect(shouldForceExitForUpdate(false, "1.0.5")).toBe(false);
    expect(shouldForceExitForUpdate(true)).toBe(false);
  });
});
