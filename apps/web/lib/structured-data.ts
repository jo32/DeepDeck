import { documentLanguage, localePath, type SiteLocale } from "./locale";
import { siteUrl } from "./site";

const githubUrl = "https://github.com/jo32/DeepDeck";

const localizedDescription: Record<SiteLocale, string> = {
  en: "Open-source desktop client for DeepSeek Harness with installable Apps. Its WebMCP Browser lets agents explore websites and save verified workflows as reusable tools, alongside tools websites already provide.",
  zh: "开源 DeepSeek Harness 桌面客户端，支持可安装 App。WebMCP Browser 让 Agent 自己探索网站，把验证过的使用经验保存成工具，并复用网站已有 WebMCP。",
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
          ? ["本地 DeepSeek Harness 运行时", "可安装扩展", "AI 辅助构建 App", "自动检查更新", "发现并复用网站已有 WebMCP", "为没有 WebMCP 的网站构建可复用工具"]
          : ["Local DeepSeek Harness runtime", "Installable extensions", "AI-assisted app building", "Automatic update checks", "Discover and reuse existing website WebMCP", "Build reusable tools for websites without WebMCP"],
        sameAs: [githubUrl],
      },
    ],
  };
}

export function serializeStructuredData(locale: SiteLocale) {
  return JSON.stringify(createStructuredData(locale)).replaceAll("<", "\\u003c");
}
