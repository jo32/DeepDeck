import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConversationSnapshot } from "@deepseek-ai/dsh-client-runtime/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import {
  HomeHeroArtwork,
  type HomeHeroKey,
} from "../../../plugins/home-hero/src/client/HomeHeroArtwork.tsx";

const copy: Record<HomeHeroKey, string> = {
  characterLabel: "黑色圆球角色，眼睛会跟随鼠标，拖动角色可旋转",
};

const t = ((key: HomeHeroKey) => copy[key]) as TranslateNS<"homeHero">;

function session(composerPhase: ConversationSnapshot["composerPhase"]): ConversationSnapshot {
  return { composerPhase } as unknown as ConversationSnapshot;
}

describe("HomeHeroArtwork", () => {
  it("renders only the spider character on a blank session", () => {
    const html = renderToStaticMarkup(createElement(HomeHeroArtwork, {
      session: session("blank"),
      t,
    }));

    expect(html).toContain("data-openworkbuddy-home-hero")
    expect(html).toContain('data-character="spider"')
    expect(html).not.toContain("探索未至之境")
    expect(html).not.toContain("预览版")
  });

  it("does not render after the session leaves the blank composer phase", () => {
    const html = renderToStaticMarkup(createElement(HomeHeroArtwork, {
      session: session("active"),
      t,
    }));

    expect(html).toBe("")
  });
});
