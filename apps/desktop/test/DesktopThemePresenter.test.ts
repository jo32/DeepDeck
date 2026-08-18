// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThemeSnapshot } from "@deepseek-ai/dsh-client-ui-theme/client";
import { ThemePresenter } from "../../../plugins/desktop-chrome/src/client/theme-presenter.ts";

function snapshot(
  preference: ThemeSnapshot["preference"],
  colorScheme: ThemeSnapshot["active"]["colorScheme"],
): ThemeSnapshot {
  return {
    preference,
    active: { id: colorScheme, colorScheme, tokens: {} },
    themes: [],
    revision: 1,
  };
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("data-ds-dark-theme");
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  Reflect.deleteProperty(globalThis, "deepseekDesktop");
});

describe("desktop native theme projection", () => {
  it("projects an explicit dark preference into Electron", () => {
    const setThemeSource = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "deepseekDesktop", {
      configurable: true,
      value: { appearance: { setThemeSource } },
    });

    new ThemePresenter().apply(snapshot("dark", "dark"));

    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(setThemeSource).toHaveBeenCalledWith("dark");
  });

  it("preserves system mode instead of pinning its currently resolved palette", () => {
    const setThemeSource = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "deepseekDesktop", {
      configurable: true,
      value: { appearance: { setThemeSource } },
    });

    new ThemePresenter().apply(snapshot("system", "dark"));

    expect(setThemeSource).toHaveBeenCalledWith("system");
  });
});
