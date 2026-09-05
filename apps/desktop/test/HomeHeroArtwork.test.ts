import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DockedComposer } from '../../../plugins/home-hero/src/client/ComposerPresentation.tsx';
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
  return {
    composerPhase,
    running: false,
    subagent: null,
    removed: false,
  } as unknown as ConversationSnapshot;
}

function input(draftRev = 0): HomeHeroArtworkProps["input"] {
  return { draft: "", imageIds: [], draftRev, phase: "plain" };
}

describe("HomeHeroArtwork", () => {
  it('keeps an empty Browser composer compact without changing session facts', () => {
    const snapshot = session('blank');
    const html = renderToStaticMarkup(createElement(DockedComposer, {
      children: createElement(HomeHeroArtwork, { session: snapshot, input: input(), t }),
    }));
    expect(html).toContain('data-motion="docked"');
    expect(html).toContain('data-action="send"');
    expect(html).not.toContain('data-motion="resting"');
    expect(snapshot.composerPhase).toBe('blank');
  });
  it("renders only the alien orb character on a blank session", () => {
    const html = renderToStaticMarkup(createElement(HomeHeroArtwork, {
      session: session("blank"),
      input: input(),
      t,
    }));

    expect(html).toContain("data-deepdeck-home-hero")
    expect(html).toContain('data-character="alien"')
    expect(html).toContain('data-deepdeck-home-hero-native-cover=""')
    expect(html).toContain('data-interactive-enabled="true"')
    expect(html).toContain('data-interaction="gaze"')
    expect(html).toContain('data-expression="auto"')
    expect(html).not.toContain('data-renderer="baked-svg"')
    expect(html).toContain("高光黑色外星人圆球")
    expect(html).not.toContain("探索未至之境")
    expect(html).not.toContain("预览版")
  });

  it("keeps the same alien renderer mounted in its compact Send posture", () => {
    const html = renderToStaticMarkup(createElement(HomeHeroArtwork, {
      session: session("active"),
      input: { ...input(), draft: "next message" },
      t,
    }));

    expect(html).toContain("data-deepdeck-home-hero")
    expect(html).toContain('data-motion="docked"')
    expect(html).toContain('data-action="send"')
    expect(html).toContain('data-action-mode="send"')
    expect(html).toContain('data-compact="true"')
    expect(html).toContain('data-character="alien"')
    expect(html).toContain('data-deepdeck-home-hero-native-cover=""')
    expect(html).toContain('data-interactive-enabled="false"')
    expect(html).toContain('data-interaction="fixed"')
    expect(html).not.toContain('data-renderer="baked-svg"')
  });
});
