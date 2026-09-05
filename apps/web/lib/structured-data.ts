import { documentLanguage, localePath, type SiteLocale } from "./locale";
import { siteUrl } from "./site";

const githubUrl = "https://github.com/jo32/DeepDeck";

const localizedDescription: Record<SiteLocale, string> = {
  en: "Open-source desktop client for DeepSeek Harness with installable Apps, AI-assisted app building, and a Browser + WebMCP development preview.",
  zh: "开源 DeepSeek Harness 桌面客户端，支持可安装 App、AI 辅助构建，以及 Browser + WebMCP 开发预览。",
};

export function createStructuredData(locale: SiteLocale) {
  const pageUrl = new URL(localePath[locale], siteUrl).toString();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "DeepDeck",
        description: localizedDescription[locale],
        inLanguage: ["en", "zh-CN"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "DeepDeck",
        url: pageUrl,
        description: localizedDescription[locale],
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "AI desktop client",
        operatingSystem: "macOS",
        inLanguage: documentLanguage[locale],
        isAccessibleForFree: true,
        license: `${githubUrl}/blob/main/LICENSE`,
        codeRepository: githubUrl,
        downloadUrl: `${githubUrl}/releases/latest`,
        image: `${siteUrl}/deepdeck-app.png`,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: locale === "zh"
          ? ["本地 DeepSeek Harness 运行时", "可安装扩展", "AI 辅助构建 App", "自动检查更新", "Browser + WebMCP（源码开发预览）"]
          : ["Local DeepSeek Harness runtime", "Installable extensions", "AI-assisted app building", "Automatic update checks", "Browser + WebMCP (source development preview)"],
        sameAs: [githubUrl],
      },
    ],
  };
}

export function serializeStructuredData(locale: SiteLocale) {
  return JSON.stringify(createStructuredData(locale)).replaceAll("<", "\\u003c");
}
