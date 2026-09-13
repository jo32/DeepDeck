'use client';
import { useState } from 'react';
import type { SiteLocale } from '../../lib/locale';
import { benchmarkSample as sample } from '../../lib/benchmark';
import s from './benchmark.module.css';

export function BenchmarkEvidence({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  const t = (cn: string, en: string) => zh ? cn : en;
  const [selected, setSelected] = useState(2);
  const criteria = [
    { name: t('评论内容', 'Comment content'), correct: sample.verifiedContent, requirement: t('按页面显示顺序，取回十帖各前十条有效评论的身份、作者、正文和链接。', 'Retrieve the identity, author, text, and link of the first ten valid comments in displayed order from each of ten discussions.'), observation: t('100 条目标评论全部取回。独立核验确认内容正确，顺序与当轮采集记录一致。', 'All 100 target comments were retrieved. Independent verification confirmed content accuracy and order against the run’s captured observations.'), verdict: t('这一项通过。正文完整，不代表所有任务要求都已满足。', 'This criterion passed. Complete text does not establish completion of every task requirement.') },
    { name: t('字符格式', 'Character format'), correct: sample.verifiedPrefixes, requirement: t('正文合并连续空白后，返回前 80 个 Unicode 字符；不足 80 个时返回全部。', 'Normalize consecutive whitespace and return the first 80 Unicode characters, or the full text when shorter.'), observation: t('100 条正文片段全部符合要求。文件记录与离线脚本整理在本轮允许并实际使用。', 'All 100 text prefixes met the requirement. File notes and offline processing were allowed and used in this run.'), verdict: t('这一项通过。按交付结果验证格式，不限制正确的离线整理方式。', 'This criterion passed. Formatting is checked in the output; valid offline processing is allowed.') },
    { name: t('回复关系', 'Reply relationships'), correct: sample.verifiedParents, requirement: t('每条评论都需要确认父评论，或确认它是顶层评论。未知状态不算已完成。', 'Every comment must have a verified parent, or be verified as top-level. An unknown relationship is incomplete.'), observation: t('25 条关系已确认：12 条顶层、13 条有已验证父评论。其余 75 条明确标为未知。', '25 relationships were confirmed: 12 top-level and 13 with verified parents. The other 75 were explicitly unknown.'), verdict: t('这一项未通过。75 条关系未确认，因此本轮完整任务未通过。', 'This criterion did not pass. With 75 relationships unverified, the complete task did not pass.') },
  ];
  const current = criteria[selected];
  return <div className={s.evidence}>
    <div className={s.evidenceTop}><span><i />{t('已完成实验 · 评分示例', 'COMPLETED EXPERIMENT · SCORING EXAMPLE')}</span><span>HN / RUN 02</span></div>
    <div className={s.evidenceLayout}>
      <aside className={s.taskBrief}><span className={s.eyebrow}>{t('任务', 'THE TASK')}</span><h3>{t('整理十帖评论，保留回复关系。', 'Read ten discussions. Preserve the reply relationships.')}</h3><p>{t('仅访问 Hacker News 站内，按显示顺序读取每帖前十条有效评论。', 'Stay on Hacker News and read the first ten valid comments per discussion, in displayed order.')}</p><dl><div><dt>{t('采集方式', 'Acquisition')}</dt><dd>Computer Use</dd></div><div><dt>{t('笔记 / 离线脚本', 'Notes / offline scripts')}</dt><dd>{t('允许', 'Allowed')}</dd></div><div><dt>{t('实测耗时', 'Observed time')}</dt><dd>16m 45s</dd></div><div><dt>{t('总 Token', 'Total tokens')}</dt><dd>{sample.tokens.toLocaleString('en-US')}</dd></div><div><dt>{t('工具调用', 'Tool calls')}</dt><dd>{sample.toolCalls}</dd></div></dl><div className={s.taskVerdict}><span>{t('完整任务', 'COMPLETE TASK')}</span><strong>{t('未通过', 'Not passed')} ↗</strong><small>{t('有未完成的必要字段', 'Required fields remain incomplete')}</small></div></aside>
      <div className={s.scorePanel}>
        <div className={s.criteria} role="group" aria-label={t('选择评分维度', 'Select a scoring criterion')}>
          {criteria.map((item, i) => <button key={item.name} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><span>{item.name}</span><strong>{item.correct}<small>/{sample.expectedComments}</small></strong><i className={i===2 ? s.amberMark : s.greenMark} aria-hidden="true">{i===2 ? '!' : '✓'}</i></button>)}
        </div>
        <div className={s.criterionDetail} aria-live="polite" aria-atomic="true">
          <div className={s.detailTitle}><h4>{current.name}</h4><span>{t('已确认', 'VERIFIED')} {current.correct}/{sample.expectedComments}</span></div>
          <div className={s.dotGrid} aria-hidden="true">{Array.from({length:sample.expectedComments},(_,i)=><i key={i} className={i<current.correct?s.verifiedDot:s.unknownDot} />)}</div>
          <p className={s.gridLegend}><span><i className={s.verifiedDot}/>{t('已核验正确', 'Verified correct')}</span><span><i className={s.unknownDot}/>{t('未确认', 'Unverified')}</span></p>
          <dl className={s.checkDetail}><div><dt>{t('任务要求', 'Requirement')}</dt><dd>{current.requirement}</dd></div><div><dt>{t('核验依据', 'Observation')}</dt><dd>{current.observation}</dd></div></dl>
          <p className={selected===2?s.failNote:s.passNote}>{current.verdict}</p>
        </div>
      </div>
    </div>
    <div className={s.evidenceFoot}><p>{t('数据来自已完成的 HN 实验，原结果经独立页面核验。此交互展示评分方式，不会启动 Agent；WebMCP 裁判流程属于下方的试点设计。', 'Data comes from a completed HN experiment verified independently against the page. This interactive example explains scoring; it does not run an agent. The WebMCP evaluator is the pilot design described below.')}</p><a href="/research/benchmarks/hn-sample.json" download>{t('下载样例数据', 'Download sample data')} ↓</a></div>
  </div>;
}
