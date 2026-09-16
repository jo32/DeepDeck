import type { SiteLocale } from '../../lib/locale';
import corpus from '../../lib/benchmark-corpus.json';
import s from './benchmark.module.css';

export function BenchmarkCorpus({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  const tiers = [
    { id: 'answer', title: t('内容问答', 'Read & answer'), description: t('读取页面、查询政策、核对信息是否存在。', 'Read pages, look up policies, and check whether information exists.') },
    { id: 'act-short', title: t('短流程操作', 'Short workflows'), description: t('搜索、筛选、选择商品，或登录后查询记录。', 'Search, filter, select products, or sign in to look up a record.') },
    { id: 'act-long', title: t('多步工作流', 'Multi-step workflows'), description: t('跨页面完成选课、订单查询、发票与财务操作。', 'Complete enrollment, order lookups, invoice and finance workflows across pages.') },
    { id: 'transaction', title: t('交易与状态变更', 'Transactions & state changes'), description: t('在本地测试环境中完成预约、取消、报名或测试结账。', 'Book, cancel, register, or complete test checkout in local environments.') },
  ] as const;
  return <section id="tasks" className={`${s.section} ${s.shell}`} aria-labelledby="corpus-title">
    <div className={s.sectionHeading}><div><p className={s.eyebrow}>THE TASK CORPUS</p><h2 id="corpus-title">{t(`${corpus.sites.length} 个网站，`, `${corpus.sites.length} websites.`)}<br />{t(`${corpus.total} 道具体任务。`, `${corpus.total} concrete tasks.`)}</h2></div><p>{t('从读懂一篇文章，到完成预约和测试结账。题库基于开源网站的本地实例，配有任务、测试数据、WebMCP 实现与评分规则；可用于模型评测，也可用于 WebMCP 开关对照。', 'From reading an article to booking an appointment or completing test checkout. The corpus uses local instances of open-source websites with tasks, fixtures, WebMCP implementations, and scoring rules, for model benchmarks and WebMCP on/off comparisons.')}</p></div>
    <div className={s.corpusTiers}>{tiers.map(tier => <article key={tier.id}><span>{corpus.tiers[tier.id]} {t('题', 'tasks')}</span><h3>{tier.title}</h3><p>{tier.description}</p></article>)}</div>
    <div className={s.corpusSites}>{corpus.sites.map(site => <details key={site.id} className={s.corpusSite}>
      <summary><span><small>{site.category[locale]}</small><strong>{site.name}</strong></span><span className={s.corpusCount}>{site.tasks.length} {t('题', 'tasks')} <span aria-hidden="true">＋</span></span></summary>
      <div className={s.corpusDetail}><p>{t('展开查看题目 · 类型沿用题库分层，不代表模型实测难度。', 'Task types follow the corpus taxonomy, not measured model difficulty.')}</p><ul>{site.tasks.map(task => <li key={task.id}><span>{task.title[locale]}</span><small>{tiers.find(tier => tier.id === task.tier)?.title}</small></li>)}</ul></div>
    </details>)}</div>
    <div className={s.corpusNotes}><p>{t(`另外提供 ${corpus.calibrationCount} 道校准题和 ${corpus.templateCount} 个自定义题模板，不计入上述 ${corpus.total} 题。${corpus.excluded.length} 道仅 API 数据可见的课程题已排除。`, `An additional ${corpus.calibrationCount} calibration tasks and ${corpus.templateCount} custom-task template are outside the ${corpus.total}-task total. ${corpus.excluded.length} course task using API-only data is excluded.`)}</p><p>{t('这些数字表示题库覆盖范围，不是全部任务均已通过的实测成绩。网站启动与工具注册检查、模型完成任务、答案评分是不同层次的验证；具体评分规则与运行状态以各次报告为准。', 'These counts describe corpus coverage, not a claim that every task has passed. Site startup and tool discovery, agent completion, and answer scoring are separate checks. Refer to individual reports for scoring rules and run status.')}</p><p>{t(`题库起点引入自 WindTunnel，已保留上游署名；本地题目和实现可继续修改。线上网站 + query 的自由消融实验不受这 ${corpus.total} 题限制。`, `The starting corpus was imported from WindTunnel with attribution retained; local tasks and implementations remain editable. Free-form website + query ablations are not limited to these ${corpus.total} tasks.`)}</p></div>
  </section>;
}
