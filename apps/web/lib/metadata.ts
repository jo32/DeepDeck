import type { Metadata, Viewport } from "next";
import { localePath, type SiteLocale } from "./locale";
import { siteUrl } from "./site";

const localeMetadata = {
  zh: {
    locale: "zh_CN",
    alternateLocale: "en_US",
    title: "DeepDeck：开源 DeepSeek Harness 桌面客户端",
    description: "DeepDeck 是开源的 DeepSeek Harness 桌面客户端，支持可安装 App 与 AI 辅助构建。Browser + WebMCP 现已发布：每个网站一个 Agent，让页面操作成为可复用工具。",
    keywords: ["DeepSeek Harness 桌面客户端", "本地 AI 工作台", "Cordis App", "Vibe Coding", "WebMCP", "网站 Agent"],
    imageAlt: "DeepDeck 开源 DeepSeek Harness 桌面客户端",
    image: "/zh/opengraph-image",
  },
  en: {
    locale: "en_US",
    alternateLocale: "zh_CN",
    title: "DeepDeck: Open-Source Desktop Client for DeepSeek Harness",
    description: "DeepDeck is an open-source DeepSeek Harness desktop client with installable Apps. Browser + WebMCP brings a dedicated Agent and reusable tools for your websites.",
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
