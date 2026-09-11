import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/webmcp`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${siteUrl}/zh/webmcp`, changeFrequency: 'weekly', priority: 0.8 },
    {
      url: siteUrl,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/zh`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
