import { describe, expect, it } from "vitest";
import { parseReadinessUrl } from "./readiness.js";

describe("parseReadinessUrl", () => {
  it("accepts the upstream loopback readiness line", () => {
    expect(parseReadinessUrl("dsh web: http://127.0.0.1:43121")).toBe(
      "http://127.0.0.1:43121",
    );
  });

  it("accepts a readiness line with the optional LAN suffix", () => {
    expect(
      parseReadinessUrl(
        "dsh web: http://127.0.0.1:3080 (LAN: http://192.168.1.5:3080)",
      ),
    ).toBe("http://127.0.0.1:3080");
  });

  it("rejects non-loopback and malformed output", () => {
    expect(parseReadinessUrl("dsh web: http://localhost:3080")).toBeUndefined();
    expect(parseReadinessUrl("server ready")).toBeUndefined();
  });
});
