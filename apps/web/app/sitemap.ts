import type { MetadataRoute } from "next";
import { blogPosts, blogPath } from "../lib/blog";
import { siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...(["en", "zh"] as const).flatMap(locale => [
      { url: `${siteUrl}${blogPath(locale)}`, changeFrequency: "weekly" as const, priority: 0.7 },
      ...blogPosts.map(post => ({ url: `${siteUrl}${blogPath(locale, post.slug)}`, lastModified: post.date, changeFrequency: "monthly" as const, priority: 0.7 })),
    ]),
    { url: `${siteUrl}/benchmarks`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/zh/benchmarks`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/webmcp/experiments`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/zh/webmcp/experiments`, changeFrequency: 'monthly', priority: 0.8 },
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
