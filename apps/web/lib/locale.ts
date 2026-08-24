import { cookies, headers } from "next/headers";

export type SiteLocale = "zh" | "en";

export const localeCookieName = "deepdeck-locale";

export function detectLocale(acceptLanguage: string | null): SiteLocale {
  if (!acceptLanguage) {
    return "en";
  }

  const supported = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [rawLanguage, ...parameters] = entry.trim().split(";");
      const language = rawLanguage.toLowerCase();
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1;
      const locale = language === "zh" || language.startsWith("zh-")
        ? "zh"
        : language === "en" || language.startsWith("en-")
          ? "en"
          : null;

      return { locale, quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter((entry): entry is { locale: SiteLocale; quality: number; index: number } => entry.locale !== null)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  return supported[0]?.locale ?? "en";
}

export async function getRequestLocale(): Promise<SiteLocale> {
  const cookieLocale = (await cookies()).get(localeCookieName)?.value;

  if (cookieLocale === "zh" || cookieLocale === "en") {
    return cookieLocale;
  }

  return detectLocale((await headers()).get("accept-language"));
}
