import type { Metadata, Viewport } from "next";
import { localePath, type SiteLocale } from "./locale";
import { siteUrl } from "./site";

const localeMetadata = {
  zh: {
    locale: "zh_CN",
    alternateLocale: "en_US",
    title: "DeepDeck：开源 DeepSeek Harness 桌面客户端",
    description: "DeepDeck 的 WebMCP Browser 让 Agent 自己探索和使用网站，把验证过的操作经验保存成工具，供后续任务复用。既能使用已有 WebMCP，也能为网站构建工具，让现有产品更容易 Agent 化。",
    keywords: ["DeepSeek Harness 桌面客户端", "本地 AI 工作台", "Cordis App", "Vibe Coding", "WebMCP", "网站 Agent"],
    imageAlt: "DeepDeck 开源 DeepSeek Harness 桌面客户端",
    image: "/zh/opengraph-image",
  },
  en: {
    locale: "en_US",
    alternateLocale: "zh_CN",
    title: "DeepDeck: Open-Source Desktop Client for DeepSeek Harness",
    description: "DeepDeck lets agents explore websites and save verified workflows as reusable WebMCP tools. Use existing tools or build new ones without teaching every click.",
    keywords: ["DeepSeek Harness desktop client", "local AI workbench", "Cordis Apps", "Vibe Coding", "WebMCP", "website Agent"],
    imageAlt: "DeepDeck open-source desktop client for DeepSeek Harness",
    image: "/opengraph-image",
  },
} as const;

export function createSiteMetadata(locale: SiteLocale): Metadata {
  const content = localeMetadata[locale];
  const canonicalPath = localePath[locale];

  return {
    metadataBase: new URL(siteUrl),
    title: content.title,
    description: content.description,
    applicationName: "DeepDeck",
    keywords: [
      "DeepDeck",
      "DeepSeek Harness",
      "open source AI desktop",
      ...content.keywords,
    ],
    authors: [{ name: "DeepDeck" }],
    creator: "DeepDeck",
    publisher: "DeepDeck",
    category: "technology",
    alternates: {
      canonical: canonicalPath,
      languages: {
        en: "/",
        "zh-CN": "/zh",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      locale: content.locale,
      alternateLocale: content.alternateLocale,
      title: content.title,
      description: content.description,
      siteName: "DeepDeck",
      images: [{ url: content.image, width: 1200, height: 630, alt: content.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export const siteViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};
