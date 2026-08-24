import type { Metadata, Viewport } from "next";
import { siteUrl } from "./site";

const localeMetadata = {
  zh: {
    path: "/",
    locale: "zh_CN",
    alternateLocale: "en_US",
    title: "DeepDeck — 你的本地智能工作伙伴",
    description: "DeepDeck 是一个界面简约、支持独立 App，并能通过 Vibe Coding 现场构建新 App 的桌面 AI 工作台。",
    image: "/opengraph-image",
  },
  en: {
    path: "/en",
    locale: "en_US",
    alternateLocale: "zh_CN",
    title: "DeepDeck — Your local AI workbench",
    description: "DeepDeck is a focused desktop AI workbench with first-class Apps and an integrated Vibe Coding workflow for building new ones.",
    image: "/en/opengraph-image",
  },
} as const;

export type MetadataLocale = keyof typeof localeMetadata;

export function createSiteMetadata(locale: MetadataLocale): Metadata {
  const content = localeMetadata[locale];

  return {
    metadataBase: new URL(siteUrl),
    title: content.title,
    description: content.description,
    applicationName: "DeepDeck",
    keywords: [
      "DeepDeck",
      "DeepSeek Harness",
      "AI desktop",
      "AI agent",
      "Cordis plugins",
    ],
    authors: [{ name: "DeepDeck" }],
    alternates: {
      canonical: content.path,
      languages: {
        "zh-CN": "/",
        "en-US": "/en",
      },
    },
    openGraph: {
      type: "website",
      url: content.path,
      locale: content.locale,
      alternateLocale: content.alternateLocale,
      title: content.title,
      description: content.description,
      siteName: "DeepDeck",
      images: [{ url: content.image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.description,
      images: [content.image],
    },
  };
}

export const siteViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};
