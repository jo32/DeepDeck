// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSnapshot } from "@deepseek-ai/dsh-client-runtime/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";

const renderOrb = vi.hoisted(() => vi.fn(() => null));

vi.mock("../../../plugins/home-hero/src/client/SpiderOrbThree.tsx", () => ({
  default: renderOrb,
}));

import {
  HERO_LAUNCH_MS,
  HERO_RETURN_MS,
  HomeHeroArtwork,
  TYPING_IDLE_MS,
  type HomeHeroArtworkProps,
  type HomeHeroKey,
} from "../../../plugins/home-hero/src/client/HomeHeroArtwork.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy: Record<HomeHeroKey, string> = {
  characterLabel: "Alien Orb",
};
const t = ((key: HomeHeroKey) => copy[key]) as TranslateNS<"homeHero">;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function session(
  composerPhase: ConversationSnapshot["composerPhase"],
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return {
    composerPhase,
    running: false,
    subagent: null,
    removed: false,
    ...overrides,
  } as unknown as ConversationSnapshot;
}

async function render(
  draftRev: number,
  composerPhase: ConversationSnapshot["composerPhase"] = "blank",
  sessionOverrides: Partial<ConversationSnapshot> = {},
) {
  await act(async () => {
    root?.render(createElement(HomeHeroArtwork, {
      session: session(composerPhase, sessionOverrides),
      input: { draft: "ship it", imageIds: [], draftRev, phase: "plain" },
      t,
    } satisfies HomeHeroArtworkProps));
  });
}

function currentExpression(): string | undefined {
  return renderOrb.mock.calls.at(-1)?.[0].expression;
}

function currentAction(): string | undefined {
  return renderOrb.mock.calls.at(-1)?.[0].actionMode;
}

async function markRendererReady() {
  await act(async () => { renderOrb.mock.calls.at(-1)?.[0].onReady?.(); });
}

async function advancePreparationFrames() {
  await act(async () => { vi.advanceTimersByTime(34); });
}

beforeEach(() => {
  vi.useFakeTimers();
  renderOrb.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("HomeHeroArtwork typing expression", () => {
  it("uses doing while the draft changes and returns to auto after the last idle interval", async () => {
    await render(0);
    expect(currentExpression()).toBe("auto");

    await render(1);
    expect(currentExpression()).toBe("doing");

    await act(async () => { vi.advanceTimersByTime(TYPING_IDLE_MS - 200); });
    await render(2);
    await act(async () => { vi.advanceTimersByTime(TYPING_IDLE_MS - 1); });
    expect(currentExpression()).toBe("doing");

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(currentExpression()).toBe("auto");
  });

  it("moves the same orb into a 48 × 60 action frame and keeps it mounted", async () => {
    const box = (left: number, top: number, width: number, height: number): DOMRect => ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.hasAttribute("data-deepdeck-home-hero-target")) return box(900, 700, 34, 34);
      if (this.hasAttribute("data-deepdeck-home-hero-resting-target")) return box(840, 390, 184, 232);
      if (this.hasAttribute("data-deepdeck-home-hero-mascot")) {
        const motion = this.getAttribute("data-motion");
        return motion === "docked" || motion === "return-armed"
          ? box(887, 675, 48, 60)
          : box(840, 390, 184, 232);
      }
      return box(0, 0, 0, 0);
    });

    await render(0, "blank");
    await markRendererReady();
    const originalMascot = container?.querySelector<HTMLElement>("[data-deepdeck-home-hero-mascot]");
    expect(renderOrb.mock.calls.at(-1)?.[0].interactive).toBe(true);
    await render(0, "engaging");

    const artwork = container?.querySelector("[data-deepdeck-home-hero]");
    const mascot = container?.querySelector<HTMLElement>("[data-deepdeck-home-hero-mascot]");
    expect(artwork?.getAttribute("data-motion")).toBe("launch-preparing");
    expect(mascot).toBe(originalMascot);
    expect(mascot?.getAttribute("data-motion")).toBe("launch-preparing");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-left")).toBe("840px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-top")).toBe("390px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-x")).toBe("47px");
    expect(currentExpression()).toBe("doing");
    expect(currentAction()).toBe("doing");
    expect(renderOrb.mock.calls.at(-1)?.[0].interactive).toBe(false);

    await advancePreparationFrames();
    expect(artwork?.getAttribute("data-motion")).toBe("launching");
    expect(mascot?.getAttribute("data-motion")).toBe("launching");

    await act(async () => { vi.advanceTimersByTime(HERO_LAUNCH_MS + 120); });
    expect(container?.querySelector("[data-deepdeck-home-hero]")).not.toBeNull();
    expect(mascot).toBe(container?.querySelector("[data-deepdeck-home-hero-mascot]"));
    expect(mascot?.getAttribute("data-motion")).toBe("docked");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-left")).toBe("887px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-top")).toBe("675px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-width")).toBe("48px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-height")).toBe("60px");

    await render(0, "active");
    expect(mascot).toBe(container?.querySelector("[data-deepdeck-home-hero-mascot]"));
    expect(currentAction()).toBe("send");
    expect(renderOrb.mock.calls.at(-1)?.[0].compact).toBe(true);
    expect(renderOrb.mock.calls.at(-1)?.[0].interactive).toBe(false);

    await render(0, "active", { running: true });
    expect(currentAction()).toBe("doing");

    await render(0, "blank");
    expect(mascot).toBe(container?.querySelector("[data-deepdeck-home-hero-mascot]"));
    expect(mascot?.getAttribute("data-motion")).toBe("return-preparing");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-left")).toBe("840px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-top")).toBe("390px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-return-x")).toBe("47px");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-return-y")).toBe("285px");
    expect(currentAction()).toBe("face");
    expect(renderOrb.mock.calls.at(-1)?.[0].compact).toBe(false);
    expect(renderOrb.mock.calls.at(-1)?.[0].interactive).toBe(false);

    await advancePreparationFrames();
    expect(mascot?.getAttribute("data-motion")).toBe("returning");

    await act(async () => { vi.advanceTimersByTime(HERO_RETURN_MS + 120); });
    expect(mascot?.getAttribute("data-motion")).toBe("resting");
    expect(mascot?.style.getPropertyValue("--deepdeck-hero-return-x")).toBe("");
    expect(renderOrb.mock.calls.at(-1)?.[0].interactive).toBe(true);
  });

  it("continues the return flight after a session-scoped remount", async () => {
    const box = (left: number, top: number, width: number, height: number): DOMRect => ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.hasAttribute("data-deepdeck-home-hero-target")) return box(900, 700, 34, 34);
      if (this.hasAttribute("data-deepdeck-home-hero-resting-target")) return box(840, 390, 184, 232);
      if (this.hasAttribute("data-deepdeck-home-hero-mascot")) return box(887, 675, 48, 60);
      return box(0, 0, 0, 0);
    });

    await render(0, "active");
    expect(container?.querySelector<HTMLElement>("[data-deepdeck-home-hero-mascot]")
      ?.style.getPropertyValue("--deepdeck-hero-left")).toBe("887px");

    await act(async () => { root?.unmount(); });
    root = createRoot(container!);
    await render(0, "blank");

    const returnedMascot = container?.querySelector<HTMLElement>("[data-deepdeck-home-hero-mascot]");
    expect(returnedMascot?.getAttribute("data-motion")).toBe("return-preparing");
    expect(returnedMascot?.style.getPropertyValue("--deepdeck-hero-left")).toBe("840px");
    expect(returnedMascot?.style.getPropertyValue("--deepdeck-hero-return-x")).toBe("47px");

    await markRendererReady();
    expect(returnedMascot?.getAttribute("data-motion")).toBe("return-preparing");
    await advancePreparationFrames();
    expect(returnedMascot?.getAttribute("data-motion")).toBe("returning");

    await act(async () => { vi.advanceTimersByTime(HERO_RETURN_MS + 120); });
    expect(returnedMascot?.getAttribute("data-motion")).toBe("resting");
  });
});
