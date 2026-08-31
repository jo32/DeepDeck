function toOrigin(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const url = value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;

  return new URL(url).origin;
}

export const productionSiteUrl = "https://deepdeck.getmegaportal.com";

export const siteUrl =
  toOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
  toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  productionSiteUrl;
