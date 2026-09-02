import { describe, expect, it } from "vitest";
import { appWindowRecoveryRoute, appWindowRecoveryUrl } from "./app-window-recovery.js";

describe("App window restart recovery", () => {
  it("captures only same-origin routes and drops the old Harness port", () => {
    expect(appWindowRecoveryRoute(
      "http://127.0.0.1:4311/apps/music?project=one#mix",
      "http://127.0.0.1:4311/",
    )).toBe("/apps/music?project=one#mix");
    expect(appWindowRecoveryRoute(
      "https://example.com/apps/music",
      "http://127.0.0.1:4311/",
    )).toBeUndefined();
  });

  it("rebinds the route to the new Harness origin without allowing an external URL", () => {
    expect(appWindowRecoveryUrl(
      "http://127.0.0.1:8422/",
      "/apps/music?project=one#mix",
    )).toBe("http://127.0.0.1:8422/apps/music?project=one#mix");
    expect(appWindowRecoveryUrl("http://127.0.0.1:8422/", "//example.com/apps/music"))
      .toBeUndefined();
  });
});
