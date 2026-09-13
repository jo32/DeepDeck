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
  const title = zh ? 'DeepDeck Bench — Ground Truth、Token 与耗时的 Computer Use 评测' : 'DeepDeck Bench — Ground Truth, Tokens & Time for Computer Use';
  const description = zh ? '用 WebMCP 与你的 Computer Use Agent 完成同一任务，检查答案是否正确，比较成功率、Token 用量和耗时。查看实验结果并申请试点评测。' : 'Run the same tasks with WebMCP and your computer-use agent. Check answers and compare success, token usage, and time. View experiments and apply for a pilot.';
  const path = zh ? '/zh/benchmarks' : '/benchmarks';
  return { title, description, alternates: { canonical: path, languages: { en: '/benchmarks', 'zh-CN': '/zh/benchmarks', 'x-default': '/benchmarks' } },
    openGraph: { type: 'website', title, description, url: path, locale: zh ? 'zh_CN' : 'en_US', siteName: 'DeepDeck', images: [{ url: '/benchmarks/share-image', width: 1200, height: 630, alt: 'DeepDeck Bench — Ground truth. Tokens. Time.' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/benchmarks/share-image'] },
  };
}
