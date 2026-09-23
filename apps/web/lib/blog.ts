import type { Metadata } from 'next';
import { benchmarkDrivenAgent } from './blog-posts/benchmark-driven-agent';
import type { BlogPost } from './blog-types';
import type { SiteLocale } from './locale';
import { siteUrl } from './site';

export const blogPosts: BlogPost[] = [benchmarkDrivenAgent];
export const blogPath = (locale: SiteLocale, slug?: string) => `${locale === 'zh' ? '/zh' : ''}/blog${slug ? `/${slug}` : ''}`;
export const getBlogPost = (slug: string) => blogPosts.find(post => post.slug === slug);
export const blogDate = (date: string, locale: SiteLocale) => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export function blogMetadata(locale: SiteLocale, post?: BlogPost): Metadata {
  const content = post?.translations[locale];
  const title = content ? `${content.title} | DeepDeck Blog` : locale === 'zh' ? '博客 | DeepDeck' : 'Blog | DeepDeck';
  const description = content?.description ?? (locale === 'zh' ? '记录 DeepDeck 的开发、Agent 评测与工具设计。公开过程、数据，以及没有改善的结果。' : 'Notes on building DeepDeck, evaluating agents, and designing tools. The process, the data, and the regressions.');
  const path = blogPath(locale, post?.slug);
  const image = '/blog/benchmark-iteration.png';
  return {
    title, description,
    alternates: { canonical: path, languages: { en: blogPath('en', post?.slug), 'zh-CN': blogPath('zh', post?.slug), 'x-default': blogPath('en', post?.slug) } },
    openGraph: { title, description, url: path, siteName: 'DeepDeck', locale: locale === 'zh' ? 'zh_CN' : 'en_US', alternateLocale: locale === 'zh' ? 'en_US' : 'zh_CN', type: post ? 'article' : 'website', ...(post ? { publishedTime: `${post.date}T00:00:00Z`, authors: [post.author] } : {}), images: [{ url: image, width: 1200, height: 630, alt: 'DeepDeck: benchmark, inspect, improve, retest' }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export function blogStructuredData(post: BlogPost, locale: SiteLocale) {
  const content = post.translations[locale];
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: content.title,
    description: content.description, datePublished: `${post.date}T00:00:00Z`,
    inLanguage: locale === 'zh' ? 'zh-CN' : 'en', mainEntityOfPage: `${siteUrl}${blogPath(locale, post.slug)}`,
    author: { '@type': 'Person', name: post.author, url: 'https://github.com/jo32' },
    publisher: { '@type': 'Organization', name: 'DeepDeck', url: siteUrl },
  }).replace(/</g, '\\u003c');
}
