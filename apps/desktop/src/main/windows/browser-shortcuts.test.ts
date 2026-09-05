import { describe, expect, it } from "vitest";
import { browserShortcut } from "./browser-shortcuts.js";

describe("Chrome-style browser shortcuts", () => {
  const key = (key: string, modifiers: Record<string, boolean | string> = {}, platform = "darwin") =>
    browserShortcut({ type: "keyDown", key, ...modifiers }, platform);
  it("distinguishes reopen and hard reload from their unshifted commands", () => {
    for (const platform of ["darwin", "win32", "linux"]) {
      const mod = platform === "darwin" ? { meta: true } : { control: true };
      expect(key("t", mod, platform)).toEqual({ action: "new" });
      expect(key("T", { ...mod, shift: true }, platform)).toEqual({ action: "reopen" });
      expect(key("r", mod, platform)).toEqual({ action: "reload" });
      expect(key("R", { ...mod, shift: true }, platform)).toEqual({ action: "reloadIgnoringCache" });
      expect(key("W", { ...mod, shift: true }, platform)).toBeUndefined();
    }
  });
  it("supports tab cycling, direct selection and the last tab", () => {
    expect(key("Tab", { control: true })).toEqual({ action: "cycle", offset: 1 });
    expect(key("Tab", { control: true, shift: true })).toEqual({ action: "cycle", offset: -1 });
    expect(key("ArrowRight", { meta: true, alt: true })).toEqual({ action: "cycle", offset: 1 });
    expect(key("Left", { meta: true, alt: true })).toEqual({ action: "cycle", offset: -1 });
    expect(key("{", { meta: true, shift: true, code: "BracketLeft" })).toEqual({ action: "cycle", offset: -1 });
    expect(key("PageDown", { control: true }, "win32")).toEqual({ action: "cycle", offset: 1 });
    expect(key("3", { meta: true })).toEqual({ action: "select", index: 2 });
    expect(key("9", { meta: true })).toEqual({ action: "select", index: -1 });
    expect(key("F4", { control: true }, "win32")).toEqual({ action: "close" });
  });
  it("handles navigation, find, zoom and document tools without consuming ordinary page Escape modifiers", () => {
    expect(key("[", { meta: true })).toEqual({ action: "back" });
    expect(key("ArrowRight", { alt: true }, "win32")).toEqual({ action: "forward" });
    expect(key("+", { meta: true, shift: true })).toEqual({ action: "zoomIn" });
    expect(key("0", { control: true }, "linux")).toEqual({ action: "zoomReset" });
    expect(key("F5", { control: true }, "win32")).toEqual({ action: "reloadIgnoringCache" });
    expect(key("F3", { shift: true })).toEqual({ action: "findPrevious" });
    expect(key("g", { meta: true })).toEqual({ action: "findNext" });
    expect(key("p", { meta: true })).toEqual({ action: "print" });
    expect(key("s", { meta: true })).toEqual({ action: "save" });
    expect(key("j", { meta: true, shift: true })).toEqual({ action: "downloads" });
    expect(key("i", { meta: true, alt: true })).toEqual({ action: "devtools" });
    expect(key("f", { meta: true, control: true })).toEqual({ action: "fullscreen" });
    expect(key("Escape")).toEqual({ action: "stop" });
    expect(key("Escape", { alt: true })).toBeUndefined();
  });
  it("leaves typing, unrelated modifiers, OS window shortcuts and key releases alone", () => {
    for (const input of [{ key: "w" }, { key: "w", control: true }, { key: "w", meta: true, alt: true },
      { key: "w", meta: true, shift: true }, { key: "Tab", control: true, meta: true }]) {
      expect(browserShortcut({ type: "keyDown", ...input }, "darwin")).toBeUndefined();
    }
    expect(browserShortcut({ type: "keyUp", key: "t", meta: true }, "darwin")).toBeUndefined();
  });
});
