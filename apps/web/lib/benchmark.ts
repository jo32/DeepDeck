import type { Metadata } from 'next';
import type { SiteLocale } from './locale';

export const benchmarkSample = {
  id: 'hn-cu-offline-baseline-2',
  task: 'Ten HN discussions, first ten valid comments per discussion',
  expectedComments: 100,
  verifiedContent: 100,
  verifiedPrefixes: 100,
  verifiedParents: 25,
  unknownParents: 75,
  seconds: 1004.6,
  tokens: 9582590,
  toolCalls: 69,
  complete: false,
  source: 'hn-cu-offline-processing-2026-09-13 / baseline-2',
  verification: 'Independent page verification in the original experiment. The proposed WebMCP evaluator is a pilot design, not a deployed evaluation service.',
} as const;

export function benchmarkMetadata(locale: SiteLocale): Metadata {
  const zh = locale === 'zh';
  const title = zh ? 'DeepDeck Bench — 模型 Computer Use 评测与 WebMCP 消融实验' : 'DeepDeck Bench — Model Benchmarks & WebMCP Ablation';
  const description = zh ? '用 DeepDeck Computer Use Harness 自动评测你的模型，或输入网站与 query，自动开关 WebMCP 做消融实验，比较答案、Token 与耗时。' : 'Benchmark your model with DeepDeck’s computer-use harness, or enter a website and query to run WebMCP on/off ablations. Compare answers, tokens, and time.';
  const path = zh ? '/zh/benchmarks' : '/benchmarks';
  return { title, description, alternates: { canonical: path, languages: { en: '/benchmarks', 'zh-CN': '/zh/benchmarks', 'x-default': '/benchmarks' } },
    openGraph: { type: 'website', title, description, url: path, locale: zh ? 'zh_CN' : 'en_US', siteName: 'DeepDeck', images: [{ url: '/benchmarks/share-image', width: 1200, height: 630, alt: 'DeepDeck Bench — Model benchmarks. WebMCP ablation.' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/benchmarks/share-image'] },
  };
}
