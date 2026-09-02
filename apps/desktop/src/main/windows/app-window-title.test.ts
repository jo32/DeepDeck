import { describe, expect, it } from "vitest";
import { appWindowTitle } from "./app-window-title.js";

describe("App window titles", () => {
  it("uses the App document title in native chrome", () => {
    expect(appWindowTitle("AI 人物情报", "DeepDeck")).toBe("AI 人物情报");
  });

  it("normalizes untrusted page text and falls back for empty titles", () => {
    expect(appWindowTitle("  Daily\n  Brief\t", "DeepDeck")).toBe("Daily Brief");
    expect(appWindowTitle(" \u0000\n ", "DeepDeck")).toBe("DeepDeck");
  });

  it("bounds the native title length", () => {
    expect(appWindowTitle("x".repeat(160), "DeepDeck")).toHaveLength(120);
  });
});
