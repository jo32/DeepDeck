import { ImageResponse } from "next/og";
import type { SiteLocale } from "../../lib/locale";

export const openGraphImageSize = { width: 1200, height: 630 };
export const openGraphImageContentType = "image/png";

const imageCopy: Record<SiteLocale, {
  headline: readonly [string, string];
  summary: string;
  footer: string;
}> = {
  en: {
    headline: ["Desktop AI,", "built for Harness."],
    summary: "Focused workbench · Installable Apps · AI-assisted building",
    footer: "Open source · Local · Extensible",
  },
  zh: {
    headline: ["DeepSeek Harness", "桌面 AI 工作台"],
    summary: "简约交互 · 可安装 App · AI 辅助构建",
    footer: "开源 · 本地运行 · 可扩展",
  },
};

export function createOpenGraphImage(locale: SiteLocale) {
  const content = imageCopy[locale];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          background: "#ffffff",
          color: "#0a0a0a",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(#ededed 1px, transparent 1px), linear-gradient(90deg, #ededed 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "linear-gradient(to right, transparent, black 45%, black)",
            opacity: 0.75,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, fontWeight: 700 }}>
          <div
            style={{
              width: 52,
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "#000",
              gap: 6,
            }}
          >
            <span style={{ width: 10, height: 17, borderRadius: "50%", background: "#fff", transform: "rotate(-18deg)" }} />
            <span style={{ width: 10, height: 17, borderRadius: "50%", background: "#fff", transform: "rotate(18deg)" }} />
          </div>
          DeepDeck
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 74,
              lineHeight: 1.08,
              letterSpacing: "-4px",
              fontWeight: 650,
            }}
          >
            <span>{content.headline[0]}</span>
            <span>{content.headline[1]}</span>
          </div>
          <div style={{ fontSize: 25, color: "#666", letterSpacing: "-0.5px" }}>
            {content.summary}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 20 }}>
          <span>DeepDeck · Open Source</span>
          <span style={{ color: "#777" }}>{content.footer}</span>
        </div>
      </div>
    ),
    openGraphImageSize,
  );
}
