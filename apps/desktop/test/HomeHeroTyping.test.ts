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

function session(composerPhase: ConversationSnapshot["composerPhase"]): ConversationSnapshot {
  return { composerPhase } as unknown as ConversationSnapshot;
}

async function render(draftRev: number, composerPhase: ConversationSnapshot["composerPhase"] = "blank") {
  await act(async () => {
    root?.render(createElement(HomeHeroArtwork, {
      session: session(composerPhase),
      input: { draftRev },
      t,
    } satisfies HomeHeroArtworkProps));
  });
}

function currentExpression(): string | undefined {
  return renderOrb.mock.calls.at(-1)?.[0].expression;
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
});
