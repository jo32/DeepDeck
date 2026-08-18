import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConversationSnapshot } from "@deepseek-ai/dsh-client-runtime/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import {
  HomeHeroArtwork,
  type HomeHeroArtworkProps,
  type HomeHeroKey,
} from "../../../plugins/home-hero/src/client/HomeHeroArtwork.tsx";

const copy: Record<HomeHeroKey, string> = {
  characterLabel: "Alien Orb 外星人圆球角色，眼睛会跟随鼠标，拖动角色可旋转",
};

const t = ((key: HomeHeroKey) => copy[key]) as TranslateNS<"homeHero">;

function session(composerPhase: ConversationSnapshot["composerPhase"]): ConversationSnapshot {
  return { composerPhase } as unknown as ConversationSnapshot;
}

function input(draftRev = 0): HomeHeroArtworkProps["input"] {
  return { draftRev };
}

describe("HomeHeroArtwork", () => {
  it("renders only the alien orb character on a blank session", () => {
    const html = renderToStaticMarkup(createElement(HomeHeroArtwork, {
      session: session("blank"),
      input: input(),
      t,
    }));

    expect(html).toContain("data-deepdeck-home-hero")
    expect(html).toContain('data-character="alien"')
    expect(html).toContain('data-expression="auto"')
    expect(html).not.toContain('data-renderer="baked-svg"')
    expect(html).toContain("高光黑色外星人圆球")
    expect(html).not.toContain("探索未至之境")
    expect(html).not.toContain("预览版")
  });

  it("does not render after the session leaves the blank composer phase", () => {
    const html = renderToStaticMarkup(createElement(HomeHeroArtwork, {
      session: session("active"),
      input: input(),
      t,
    }));

    expect(html).toBe("")
  });
});
