import { describe, expect, it } from "vitest";
import { isExternalUrl, isPopupPlaceholder } from "./external-popup.js";

describe("external popup policy", () => {
  it("allows only the inert about:blank placeholder", () => {
    expect(isPopupPlaceholder("about:blank")).toBe(true);
    expect(isPopupPlaceholder("about:blank#unexpected")).toBe(false);
    expect(isPopupPlaceholder("https://auth.openai.com/")).toBe(false);
  });

  it("recognizes only HTTP(S) destinations as external", () => {
    expect(isExternalUrl("https://auth.openai.com/")).toBe(true);
    expect(isExternalUrl("http://127.0.0.1:1455/auth/callback")).toBe(true);
    expect(isExternalUrl("file:///tmp/secret")).toBe(false);
    expect(isExternalUrl("javascript:alert(1)")).toBe(false);
  });
});
