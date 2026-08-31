import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
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
