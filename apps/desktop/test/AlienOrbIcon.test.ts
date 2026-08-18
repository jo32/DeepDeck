import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ALIEN_ORB_ICON_DATA_URI,
  ALIEN_ORB_ICON_SVG,
  AlienOrbIcon,
} from "../../../plugins/home-hero/src/icon.tsx";

describe("AlienOrbIcon", () => {
  it("renders a scalable, accessible one-node baked image", () => {
    const html = renderToStaticMarkup(createElement(AlienOrbIcon, {
      size: 20,
      label: "Alien assistant",
      className: "status-icon",
    }));

    expect(html).toContain('data-character="alien"');
    expect(html).toContain('data-renderer="baked-svg"');
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('alt="Alien assistant"');
    expect(html).toContain('class="status-icon"');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("<svg");
  });

  it("shares one compact filter-free SVG source across dense icon lists", () => {
    const icons = Array.from({ length: 200 }, (_, index) =>
      createElement(AlienOrbIcon, { key: index, size: 16 }));
    const html = renderToStaticMarkup(createElement("div", null, icons));
    const renderedIcons = html.match(/data-renderer="baked-svg"/g) ?? [];

    expect(renderedIcons).toHaveLength(200);
    expect(ALIEN_ORB_ICON_DATA_URI).toMatch(/^data:image\/svg\+xml,/);
    expect(ALIEN_ORB_ICON_DATA_URI.length).toBeLessThan(4_000);
    expect(decodeURIComponent(ALIEN_ORB_ICON_DATA_URI.split(",")[1] ?? ""))
      .toBe(ALIEN_ORB_ICON_SVG);
    expect(ALIEN_ORB_ICON_SVG).not.toContain("<filter");
    expect(ALIEN_ORB_ICON_SVG).not.toContain("<script");
    expect(html).not.toContain("<canvas");
  });
});
