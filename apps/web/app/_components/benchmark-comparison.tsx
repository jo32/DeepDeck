'use client';
import { useState } from 'react';
import type { SiteLocale } from '../../lib/locale';
import { experiments } from '../../lib/webmcp-experiments';
import s from './benchmark.module.css';

export function BenchmarkComparison({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  const [selected, setSelected] = useState(0);
  const run = experiments[selected];
  const metrics = [
    { label: t('完整任务成功率', 'Full-task success'), unit: t('成功轮次 / 总轮次', 'Successful runs / total runs'), cu: run.baseline.successes / run.baseline.runs, ref: run.webmcp.successes / run.webmcp.runs, cuText: `${run.baseline.successes}/${run.baseline.runs}`, refText: `${run.webmcp.successes}/${run.webmcp.runs}` },
    { label: t('Token 消耗', 'Token usage'), unit: t('总 token · 每轮中位数', 'Total tokens · median per run'), cu: run.baseline.tokens, ref: run.webmcp.tokens, cuText: run.baseline.tokens.toLocaleString('en-US'), refText: run.webmcp.tokens.toLocaleString('en-US') },
    { label: t('执行耗时', 'Elapsed time'), unit: t('秒 · 每轮中位数', 'Seconds · median per run'), cu: run.baseline.seconds, ref: run.webmcp.seconds, cuText: `${run.baseline.seconds.toFixed(3)} s`, refText: `${run.webmcp.seconds.toFixed(3)} s` },
  ];
  const notes = [
    { title: t('都完成了任务，执行代价仍然不同。', 'Same completion. Different execution costs.'), text: t('两组均 5/5 成功。WebMCP 每轮 token 中位数低 52.0%，耗时中位数低 36.2%。这组结果展示了成功率之外，仍可测量的效率差距。', 'Both groups passed 5/5 runs. WebMCP used 52.0% fewer median tokens and 36.2% less median time per run, exposing an efficiency gap beyond success rate.'), caveat: t('任务：遍历四页、65 本书，找出最低价三本。这里是五轮实测中位数的比较，不是理论最小消耗。', 'Task: scan four pages and 65 books to find the three cheapest. These compare five-run medians, not theoretical minimum costs.') },
    { title: t('参考执行，也能揭示没有收益的地方。', 'A reference also reveals where gains disappear.'), text: t('两组均 5/5 成功。WebMCP 耗时中位数低 10.3%，但 token 中位数高 8.4%。简单任务中，工具定义与调用开销也会影响结果。', 'Both groups passed 5/5 runs. WebMCP took 10.3% less median time but used 8.4% more median tokens. Tool definitions and invocation overhead can matter on simple tasks.'), caveat: t('任务：读取三条固定帖子的正文、日期与作者。基线用于发现差距，不预设 WebMCP 在每个维度都更优。', 'Task: read text, dates, and authors of three fixed posts. The reference reveals differences without assuming WebMCP wins on every metric.') },
    { title: t('消耗了更多资源，任务却仍未完成。', 'More resources spent. The task still incomplete.'), text: t('CU 完整任务 0/3 通过，WebMCP 3/3 通过。token 和耗时需要和完成度一起看：缺少回复关系的结果，不能与完整结果当成同一种交付。', 'CU passed 0/3 complete tasks; WebMCP passed 3/3. Read time and tokens alongside completion: missing reply relationships mean the outputs are not equivalent.'), caveat: t('任务：整理十帖评论及回复关系。两组为不同时间的在线运行：CU 共核验 220 条，WebMCP 共 282 条；完成量和页面状态不同，不能据此宣称等量任务加速比。', 'Task: organize comments and reply relationships across ten discussions. Live runs occurred at different times: CU verified 220 comments and WebMCP 282. Different completion volumes and page states prevent an equal-work speedup claim.') },
  ];
  return <div className={s.comparison}>
    <div className={s.comparisonTabs} role="group" aria-label={t('选择实验', 'Select an experiment')}>{experiments.map((item, i) => <button type="button" key={item.id} aria-pressed={selected === i} onClick={() => setSelected(i)}><span>0{i + 1}</span>{item.name}</button>)}</div>
    <div className={s.comparisonBody} aria-live="polite" aria-atomic="true">
      <div className={s.comparisonLegend}><span><i className={s.cuSwatch} />Computer Use</span><span><i className={s.refSwatch} />{t('WebMCP 参考执行', 'WebMCP reference run')}</span></div>
      <div className={s.metricGrid}>{metrics.map(metric => <div className={s.metricCard} key={metric.label}><h3>{metric.label}</h3><p>{metric.unit}</p>{[{ name: 'CU', value: metric.cu, text: metric.cuText, reference: false }, { name: 'WebMCP', value: metric.ref, text: metric.refText, reference: true }].map(row => <div className={s.metricRow} key={row.name}><div><span>{row.name}</span><strong>{row.text}</strong></div><div className={s.barTrack} aria-hidden="true"><i className={row.reference ? s.refBar : s.cuBar} style={{ width: `${Math.max(metric.cu, metric.ref) ? row.value / Math.max(metric.cu, metric.ref) * 100 : 0}%` }} /></div></div>)}</div>)}</div>
      <div className={s.comparisonInsight}><h3>{notes[selected].title}</h3><p>{notes[selected].text}</p><small>{notes[selected].caveat}</small></div>
    </div>
    <div className={s.evidenceFoot}><p>{t('已完成实验，非在线评测演示。总 token 是运行记录中的累计用量，包含重复上下文；不等于输出长度或账单金额。三组实验分别展示，不合并成功率。', 'Completed experiments, not a live evaluation. Total tokens are accumulated run usage, including repeated context; they are neither output length nor monetary cost. Results are shown per experiment, without pooling success rates.')}</p><a href="/research/benchmarks/reference-results.json" download>{t('下载对比数据', 'Download comparison data')} ↓</a></div>
  </div>;
}
