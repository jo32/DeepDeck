import { describe, expect, it } from "vitest";
import { browserContentBounds, browserOrigin, browserUrl, isBrowserNativeRequest, validateWebMCPScript } from "./browser-policy.js";

describe("Browser navigation boundary", () => {
  it("allows websites and an empty tab, rejecting privileged URLs and embedded credentials", () => {
    expect(browserUrl("https://example.org/path?q=1")).toBe("https://example.org/path?q=1");
    expect(browserUrl()).toBe("about:blank");
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hello", "devtools://x", "https://user:pass@example.org", "about:config", "example.org"]) {
      expect(() => browserUrl(url)).toThrow();
    }
    expect(browserOrigin("about:blank")).toBe("");
    expect(browserOrigin("https://example.org:8443/path")).toBe("https://example.org:8443");
  });
  it("keeps the native webpage outside the trusted toolbar and Agent panel", () => {
    expect(browserContentBounds(1400, 900, 96, 430)).toEqual({ x: 0, y: 96, width: 970, height: 804 });
    expect(browserContentBounds(900, 600, 9999, 9999)).toEqual({ x: 0, y: 599, width: 1, height: 1 });
  });
});

describe("Browser child requests", () => {
  it("recognizes only its bounded request envelope and known actions", () => {
    expect(isBrowserNativeRequest({ type: "deepdeck:browser:request", requestId: "1", command: { action: "page.inspect" } })).toBe(true);
    for (const value of [null, {}, { type: "deepdeck:browser:request", requestId: "", command: { action: "snapshot" } },
      { type: "deepdeck:browser:request", requestId: "1", command: { action: "shell.execute" } }]) expect(isBrowserNativeRequest(value)).toBe(false);
  });
  it("requires an exact HTTP origin and bounded revision for WebMCP scripts", () => {
    expect(() => validateWebMCPScript({ origin: "https://example.org", revision: "v1-abc", source: "void 0" })).not.toThrow();
    for (const origin of ["https://example.org/path", "https://example.org/", "*", "file://", "about:blank"]) {
      expect(() => validateWebMCPScript({ origin, revision: "v1", source: "void 0" })).toThrow();
    }
  });
});
