import type { Metadata } from 'next';
import type { SiteLocale } from './locale';

export const experiments = [
  { id: 'books', name: 'Books to Scrape', baseline: { successes: 5, runs: 5, seconds: 46.807, tokens: 92559, calls: 5 }, webmcp: { successes: 5, runs: 5, seconds: 29.855, tokens: 44440, calls: 3 } },
  { id: 'x', name: 'X', baseline: { successes: 5, runs: 5, seconds: 62.176, tokens: 134038, calls: 7 }, webmcp: { successes: 5, runs: 5, seconds: 55.748, tokens: 145301, calls: 8 } },
  { id: 'hn', name: 'Hacker News', baseline: { successes: 0, runs: 3, seconds: 968.067, tokens: 9582590, calls: 69 }, webmcp: { successes: 3, runs: 3, seconds: 407.268, tokens: 1184254, calls: 32 } },
] as const;

export function experimentMetadata(locale: SiteLocale): Metadata {
  const zh = locale === 'zh';
  const title = zh ? 'WebMCP 的潜力：三组真实实验 — DeepDeck' : 'The potential of WebMCP: three real experiments — DeepDeck';
  const description = zh ? '从 65 本书的批量筛选，到 X 三帖读取，再到 Hacker News 评论整理。查看 DeepDeck 的实测结果、工具能力与比较边界。' : 'From a 65-book catalog to three X posts and Hacker News discussions. Explore measured results, tool capabilities, and the limits of three DeepDeck experiments.';
  const path = zh ? '/zh/webmcp/experiments' : '/webmcp/experiments';
  return {
    title, description,
    alternates: { canonical: path, languages: { en: '/webmcp/experiments', 'zh-CN': '/zh/webmcp/experiments', 'x-default': '/webmcp/experiments' } },
    openGraph: { type: 'article', title, description, url: path, siteName: 'DeepDeck', locale: zh ? 'zh_CN' : 'en_US', images: [{ url: '/webmcp/experiments/share-image', width: 1200, height: 630, alt: 'DeepDeck WebMCP — three experiments, measured potential' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/webmcp/experiments/share-image'] },
  };
}
