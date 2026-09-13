import Image from 'next/image';
import type { SiteLocale } from '../../lib/locale';
import { ExperimentExplorer } from './experiment-explorer';
import styles from './experiments.module.css';

export function ExperimentsPage({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  const t = (cn: string, en: string) => zh ? cn : en;
  const home = zh ? '/zh' : '/';
  const directory = zh ? '/zh/webmcp' : '/webmcp';
  const source = '/research/webmcp-2026-09';
  return <div className={styles.page}>
    <a className={styles.skip} href="#results">{t('跳转到实验结果', 'Skip to results')}</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className="brand" href={home} aria-label={t('DeepDeck 首页', 'DeepDeck home')}><Image src="/brand/mark.svg" alt="" width={28} height={28} priority /><span>DeepDeck</span></a>
        <nav aria-label={t('页面导航', 'Page navigation')}><a href={zh ? '/zh/benchmarks' : '/benchmarks'}>Bench</a><a href="#results">{t('实验结果', 'Results')}</a><a href="#method">{t('实验方法', 'Method')}</a><a href={directory}>{t('工具目录', 'Directory')} <span aria-hidden="true">↗</span></a></nav>
        <a className={styles.language} href={zh ? '/webmcp/experiments' : '/zh/webmcp/experiments'} hrefLang={zh ? 'en' : 'zh-CN'} lang={zh ? 'en' : 'zh-CN'} aria-label={zh ? 'Switch to English' : '切换为中文'}>{zh ? 'EN' : '中文'} <span aria-hidden="true">↗</span></a>
      </div>
    </header>
    <main>
      <section className={`${styles.hero} ${styles.shell}`} aria-labelledby="experiment-title">
        <div className={styles.heroTop}><span className={styles.eyebrow}><i /> DEEPDECK FIELD NOTES <span>/ 001</span></span><time dateTime="2026-09-13">13 SEP 2026</time></div>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.kicker}>{t('三组真实实验，探索 WebMCP 的潜力', 'THREE EXPERIMENTS. THE POTENTIAL OF WEBMCP.')}</p>
            <h1 id="experiment-title">{t('让一次探索，', 'Explore once.')}<br /><span>{t('成为下一次的能力。', 'Build on it.')}</span></h1>
            <p className={styles.heroIntro}>{t('Agent 已经学会的操作，能否留给下一次任务？我们用选书、读帖和评论整理，测试把网站操作保存为 WebMCP 工具之后，会发生什么。', 'Can the next task benefit from what an agent has already learned? We tested what happens when website workflows become reusable WebMCP tools: finding books, reading posts, and organizing discussions.')}</p>
            <a className={styles.primaryLink} href="#results">{t('查看实测结果', 'Explore the results')} <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroVisual} aria-label={t('探索、验证、保存、复用的工作流程示意', 'Workflow illustration: explore, verify, save, reuse')}>
            <div className={styles.visualTop}><span><i /> {t('从操作经验，到可复用能力', 'FROM EXPERIENCE TO CAPABILITY')}</span><span>01 — 04</span></div>
            <div className={styles.flowStep}><span className={styles.flowNumber}>01</span><div><strong>{t('探索网站', 'Explore the website')}</strong><small>{t('找到页面，理解操作', 'Find pages. Understand the workflow.')}</small></div><span className={styles.flowGlyph} aria-hidden="true">↗</span></div>
            <div className={styles.flowStep}><span className={styles.flowNumber}>02</span><div><strong>{t('验证结果', 'Verify the result')}</strong><small>{t('检查字段，确认边界', 'Check fields. Establish boundaries.')}</small></div><span className={styles.flowGlyph} aria-hidden="true">✓</span></div>
            <div className={styles.toolCard}><div><span className={styles.mono}>03 / WEBMCP</span><span className={styles.saved}>{t('保存为工具', 'SAVE AS TOOLS')}</span></div><strong>{t('把有效的方法留下来。', 'Keep what works.')}</strong><div className={styles.toolTags}><span>{t('批量读取', 'Batch reads')}</span><span>{t('结构化字段', 'Structured fields')}</span><span>{t('站内导航', 'Site navigation')}</span></div></div>
            <div className={styles.reuseStep}><span className={styles.flowNumber}>04</span><strong>{t('下一次，直接复用。', 'Reuse on the next task.')}</strong><span aria-hidden="true">↻</span></div>
            <p className={styles.visualCaption}>{t('工作流程示意 · 以下实验测量已安装工具的复用', 'WORKFLOW ILLUSTRATION · EXPERIMENTS MEASURE REUSE')}</p>
          </div>
        </div>
        <div className={styles.findings}>
          {[
            ['01 / BOOKS', '−36.2%', t('批量选书耗时', 'Time on the book task'), t('两组均成功 5/5；Token 减少 52.0%', 'Both groups 5/5; 52.0% fewer tokens'), '#books'],
            ['02 / X', '−10.3%', t('简单读帖耗时', 'Time on simple post reading'), t('两组均成功 5/5；Token 增加 8.4%', 'Both groups 5/5; 8.4% more tokens'), '#x'],
            ['03 / HACKER NEWS', '3/3', t('WebMCP 完整交付', 'Complete WebMCP deliveries'), t('普通 CU 组 0/3；正文取回率 73.3%', 'CU baseline 0/3; 73.3% of comments retrieved'), '#hn'],
          ].map(([label, value, title, note, href]) => <a href={href} className={styles.finding} key={label}><span className={styles.mono}>{label}<span aria-hidden="true">↗</span></span><strong>{value}</strong><h2>{title}</h2><p>{note}</p></a>)}
        </div>
        <p className={styles.heroFootnote}>{t('耗时为中位数。不同实验的普通组能力不同，不合并总胜率；HN 两组不同期且完成度不同。', 'Times are medians. Baseline capabilities differ across experiments; success rates are not pooled. HN groups ran at different times with unequal completion.')}</p>
      </section>

      <section id="results" className={`${styles.resultsSection} ${styles.shell}`} aria-labelledby="results-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THE RESULTS</p><h2 id="results-title">{t('看见差异，也看清条件。', 'See the difference. Keep the context.')}</h2></div><p>{t('切换任务与指标，查看最终有效对照。相同模型，新会话，按最终交付逐项核验。', 'Compare the final valid groups by task and metric. Same model, fresh sessions, and field-by-field verification of the delivered answers.')}</p></div>
        <ExperimentExplorer locale={locale} />
      </section>

      <section id="books" className={`${styles.caseSection} ${styles.shell}`} aria-labelledby="books-title">
        <div className={styles.caseLabel}><span>01</span><p>BOOKS TO SCRAPE<br /><small>{t('批量读取 / 同批各 5 轮', 'BATCH READING / 5 RUNS PER GROUP')}</small></p></div>
        <div className={styles.caseGrid}>
          <div><h2 id="books-title">{t('重复的读取，', 'Repeated reads.')}<br />{t('可以一次完成。', 'Fewer agent steps.')}</h2><p className={styles.caseIntro}>{t('遍历 Fiction 四页、65 本书，找出最便宜的三本，再取回价格、UPC、库存和链接。', 'Scan four Fiction pages and 65 books, select the three cheapest, then return price, UPC, stock, and links.')}</p><p>{t('五轮 WebMCP 都主动选择了批量详情工具，没有额外导航。普通组已允许临时浏览器脚本；两组均完成全部字段。', 'All five WebMCP runs chose the batch-detail tool, with no navigation calls. The baseline already allowed ad hoc browser scripts. Both groups delivered every required field.')}</p><div className={styles.takeaway}><span>{t('这次学到了什么', 'WHAT THIS SHOWS')}</span><p>{t('规则明确、可以批量读取的任务，更容易把重复操作转化为可复用工具的收益。', 'Tasks with clear rules and batchable reads can benefit from turning repeated operations into reusable tools.')}</p></div></div>
          <div className={styles.bookPanel}><div className={styles.bookFlow}><div><strong>65</strong><span>{t('本书 / 4 页', 'BOOKS / 4 PAGES')}</span></div><span aria-hidden="true">→</span><div><strong>3</strong><span>{t('本最低价 / 完整详情', 'LOWEST PRICES / FULL DETAILS')}</span></div></div><dl className={styles.numberList}><div><dt>{t('完整成功', 'Complete success')}</dt><dd>5/5 <span>→</span> 5/5</dd></div><div><dt>{t('工具调用中位数', 'Median tool calls')}</dt><dd>5 <span>→</span> 3</dd></div><div><dt>{t('总 Token 中位数', 'Median total tokens')}</dt><dd>92,559 <span>→</span> 44,440</dd></div></dl><p className={styles.panelFootnote}>{t('普通浏览器 → WebMCP · 2026-09-10', 'General browser → WebMCP · 2026-09-10')}</p></div>
        </div>
      </section>

      <section id="x" className={styles.xSection} aria-labelledby="x-title"><div className={styles.shell}>
        <div className={styles.caseLabel}><span>02</span><p>X / THREE FIXED POSTS<br /><small>{t('简单读取 / 同批各 5 轮', 'SIMPLE READING / 5 RUNS PER GROUP')}</small></p></div>
        <div className={styles.caseGrid}>
          <div><h2 id="x-title">{t('简单读取，', 'Simple reading.')}<br />{t('也能直接调用。', 'A tool for the task.')}</h2><p className={styles.caseIntro}>{t('读取三条固定帖子的作者、日期、完整原帖正文和链接，排除引用帖、回复与推荐内容。', 'Read the author, date, full original text, and link of three fixed posts, excluding quoted posts, replies, and recommendations.')}</p><p>{t('两组全部成功 5/5。WebMCP 五轮均直接完成读取，没有使用 DevTools 兜底；普通组允许临时浏览器脚本。', 'Both groups succeeded in all five runs. WebMCP completed every run without DevTools fallback; the baseline allowed ad hoc browser scripts.')}</p><div className={styles.takeaway}><span>{t('这次学到了什么', 'WHAT THIS SHOWS')}</span><p>{t('WebMCP 耗时减少 10.3%，总 Token 增加 8.4%。简单任务中的收益体现在耗时，是否节省 Token 仍取决于调用步骤和上下文。', 'WebMCP used 10.3% less time and 8.4% more total tokens. This simple task showed a time benefit; token savings still depend on tool calls and context.')}</p></div></div>
          <div className={styles.bookPanel}><dl className={styles.numberList}><div><dt>{t('完整成功', 'Complete success')}</dt><dd>5/5 <span>→</span> 5/5</dd></div><div><dt>{t('耗时中位数', 'Median time')}</dt><dd>62.176s <span>→</span> 55.748s</dd></div><div><dt>{t('总 Token 中位数', 'Median total tokens')}</dt><dd>134,038 <span>→</span> 145,301</dd></div><div><dt>{t('工具调用中位数', 'Median tool calls')}</dt><dd>7 <span>→</span> 8</dd></div></dl><p className={styles.panelFootnote}>{t('普通浏览器 → WebMCP · 2026-09-12', 'General browser → WebMCP · 2026-09-12')}</p></div>
        </div>
      </div></section>

      <section id="hn" className={`${styles.caseSection} ${styles.shell}`} aria-labelledby="hn-title">
        <div className={styles.caseLabel}><span>03</span><p>HACKER NEWS / TEN DISCUSSIONS<br /><small>{t('复杂整理 / 最终各 3 轮', 'STRUCTURED READING / 3 FINAL RUNS PER GROUP')}</small></p></div>
        <div className={styles.caseGrid}><div><h2 id="hn-title">{t('读到正文，', 'Reading the words')}<br />{t('还要读懂关系。', 'is only part of the task.')}</h2><p className={styles.caseIntro}>{t('十个站内讨论，每帖前十条有效评论。除了正文，还要准确说明：每条评论回复了谁。', 'Ten on-site discussions, up to ten valid comments each. Beyond the text, the task required identifying which comment each reply belongs to.')}</p><p>{t('普通组只用 Computer Use 采集网页，但允许文件笔记与离线脚本。最后两轮都读齐了正文；多数父关系没有确认，因此完整成功仍为 0/3。', 'The baseline acquired pages only through Computer Use, with file notes and offline scripts allowed. The last two runs retrieved all target text, but left most parent relationships unverified: 0/3 complete tasks.')}</p><p>{t('WebMCP 直接返回评论、父关系和耗尽状态，并提供站内导航。三轮共 282 条目标评论，内容、父关系与字符格式全部正确。', 'WebMCP returns comments, parent relationships, and exhaustion status, with on-site navigation. Across three runs, all 282 target comments had correct content, parent relationships, and character formatting.')}</p></div>
          <div className={styles.hnPanel}><div className={styles.delivery}><div><span>COMPUTER USE</span><strong>0<span>/3</span></strong></div><span aria-hidden="true">→</span><div><span>WEBMCP</span><strong>3<span>/3</span></strong></div></div><p>{t('完整任务成功次数', 'COMPLETE TASK SUCCESSES')}</p><div className={styles.coverage}><div><span>{t('普通组正确取回评论', 'Baseline comments retrieved')}</span><strong>220 / 300</strong></div><div className={styles.coverageTrack}><span style={{ width: '73.3333%' }} /></div><div><span>{t('WebMCP 正确取回评论', 'WebMCP comments retrieved')}</span><strong>282 / 282</strong></div><div className={styles.coverageTrack}><span style={{ width: '100%' }} /></div></div><p className={styles.hnSmall}>{t('已返回评论的父关系：普通组 55/220 确认，165 条未知；WebMCP 282/282 确认。普通组另有 80 条未采集。', 'Parents among returned comments: baseline 55/220 verified, 165 unknown; WebMCP 282/282 verified. A further 80 baseline comments were not acquired.')}</p></div>
        </div>
        <div className={styles.hnBoundary}><strong>{t('如何理解这个差距', 'READING THIS GAP')}</strong><p>{t('固定的是帖子 ID，评论仍实时变化：WebMCP 当时每轮 94 条，普通组后来每轮 100 条。普通组还出现导航、焦点和元素失效问题，三轮均在 30 分钟上限前自行结束。结果反映本次 Harness 接入与执行，不代表所有 Computer Use 的能力上限。', 'Story IDs were fixed, but comments changed: 94 per WebMCP run, then 100 per baseline run. The baseline also encountered navigation, focus, and stale-element issues; all runs ended before the 30-minute limit. This reflects this Harness integration and execution, not a universal limit of Computer Use.')}</p></div>
      </section>

      <section className={styles.potential}><div className={styles.shell}><p className={styles.eyebrow}>WHAT BECOMES POSSIBLE</p><h2>{t('把验证过的操作，', 'Turn verified workflows')}<br />{t('留给更多次任务。', 'into a reusable capability.')}</h2><p className={styles.potentialIntro}>{t('三组实验指向同一个机会：让 Agent 少做重复探索，直接得到任务需要的能力与信息。收益取决于工具如何设计。', 'The experiments point to an opportunity: less repeated exploration, and more direct access to the capabilities and information a task needs. The gains depend on how the tools are designed.')}</p><div className={styles.principles}>{[
          [t('批量完成重复工作', 'Batch repeated work'), t('把多次详情读取合并，让模型专注于选择和判断。', 'Combine repeated detail reads so the model can focus on selection and judgment.')],
          [t('明确表达任务信息', 'Make task information explicit'), t('返回关系、顺序和完成状态，让最终结果可以核验。', 'Return relationships, order, and completion state so the result can be checked.')],
          [t('只携带必要上下文', 'Carry only useful context'), t('工具目录按需发现，源码按需读取，避免每一步重复负担。', 'Discover tool definitions and read source on demand instead of carrying them through every step.')],
        ].map(([title, body], i) => <div key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{body}</p></div>)}</div></div></section>

      <section id="method" className={`${styles.method} ${styles.shell}`} aria-labelledby="method-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>METHOD & EVIDENCE</p><h2 id="method-title">{t('结论有依据，也有边界。', 'Evidence, with boundaries.')}</h2></div><p>{t('这是三个具体只读任务的实测记录。它展示潜力，不承诺所有网站都有相同收益。', 'These are observations from three specific read-only tasks. They demonstrate potential, not a promise of equal gains on every website.')}</p></div>
        <div className={styles.methodGrid}><div className={styles.methodFacts}><div><span>{t('模型', 'MODEL')}</span><strong>gpt-6-astra</strong><small>{t('openai-codex 路由 · 默认推理设置', 'openai-codex route · default reasoning')}</small></div><div><span>{t('主结果日期', 'FINAL BATCH DATES')}</span><strong>10–13 Sep 2026</strong><small>{t('每轮新会话 · 独立核验交付字段', 'Fresh sessions · independently checked fields')}</small></div><div><span>{t('测量范围', 'MEASUREMENT')}</span><strong>{t('已安装工具的复用', 'Installed-tool reuse')}</strong><small>{t('不包含构建与准备成本', 'Authoring and preparation excluded')}</small></div></div>
        <div className={styles.accordions}>
          {[
            [t('普通组是否允许脚本和记笔记？', 'Were scripts and notes allowed?'), t('Book 和 X 普通组允许 DevTools、临时浏览器脚本。HN 最终普通组仅通过 Computer Use 取得网页内容，允许文件读写和离线脚本处理已读记录。禁止保存记录的旧组已被替换；Python 直接 HTTP 抓取组不计为 Computer Use。', 'Book and X baselines allowed DevTools and temporary browser scripts. The final HN baseline acquired web content only through Computer Use, with file tools and offline processing allowed. The old no-notes baseline was superseded; direct Python HTTP fetching does not count as Computer Use.')],
            [t('成功、耗时和 Token 如何统计？', 'How were success, time, and tokens measured?'), t('成功要求所有字段和执行条件满足，不以“访问过页面”或部分正确代替。耗时按每轮实际开始到结束计算，准备和轮间锁屏等待不计入。表中为中位数；总 Token 含缓存读取和重复输入，不等于费用。', 'Success requires every output field and execution condition, not just page visits or partial correctness. Time runs from task start to finish, excluding preparation and between-run lock-screen waits. Values are medians. Total tokens include cached reads and repeated input, not monetary cost.')],
            [t('为什么不提供一个总成功率或总加速倍数？', 'Why no pooled success rate or overall speedup?'), t('三类普通组能力不同，不能混算。Book 和 X 同批交错执行；HN 采用不同时间的历史对照，实时评论数量不同且普通组未完整完成，不能算同等工作加速。每组仅 3–5 轮，缓存和服务负载未完全控制，不宣称统计显著性。', 'Baseline capabilities differ, so results are not pooled. Book and X used interleaved same-batch runs. HN is a historical comparison with live comments and incomplete baseline output, so it is not an equal-work speedup. Samples are only 3–5 runs per group; cache and service load were not fully controlled. No statistical significance is claimed.')],
            [t('哪些结果没有放进主对照？', 'Which results are outside the main comparison?'), t('X Following 曾出现空页面和不同样本，不能据此比较效率，也没有证实反爬。中断的 HN 笔记尝试、旧禁笔记条件和直接联网脚本组单独保留。Book 早期只记录一次首次构建，不与后续复用结果拼算回本次数。全部实验都是只读任务，未验证写入操作或任意 PC 软件。', 'X Following had empty pages and mismatched samples, so it does not support an efficiency comparison or prove anti-bot interference. Interrupted HN note-taking trials, the no-notes baseline, and direct HTTP scripts are kept separate. One historical Book build trial is insufficient for a reuse break-even claim. All tasks were read-only; writing actions and arbitrary desktop software were not evaluated.')],
          ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
        </div></div>
        <div id="sources" className={styles.sources}><div><span className={styles.mono}>RESEARCH NOTES / SEPTEMBER 2026</span><h3>{t('用数据，了解每一项结果。', 'Explore the data behind the results.')}</h3><p>{t('下载完整中文报告与公开汇总数据，查看三组实验结果及比较条件。', 'Download the full Chinese report and public summary data for all three experiments and their comparison conditions.')}</p></div><div><a href={`${source}/report.zh.md`} download>{t('完整报告 · 中文 Markdown', 'Full report · Chinese Markdown')} <span aria-hidden="true">↓</span></a><a href={`${source}/results.json`} download>{t('实验数据 · JSON', 'Experiment data · JSON')} <span aria-hidden="true">↓</span></a></div></div>
      </section>
      <section className={`${styles.cta} ${styles.shell}`}><p className={styles.eyebrow}>EXPLORE WITH DEEPDECK</p><h2>{t('从一个网站，', 'Start with a website.')}<br />{t('开始积累能力。', 'Build a capability.')}</h2><div><a className={styles.primaryLink} href={directory}>{t('探索 WebMCP 工具', 'Explore WebMCP tools')} <span aria-hidden="true">↗</span></a><a className={styles.secondaryLink} href={`${home}#webmcp`}>{t('了解 DeepDeck Browser', 'Meet DeepDeck Browser')} <span aria-hidden="true">→</span></a></div></section>
    </main>
    <footer className={`${styles.footer} ${styles.shell}`}><a className="brand" href={home}>DeepDeck</a><span>{t('实测记录 · 2026 年 9 月', 'FIELD NOTES · SEPTEMBER 2026')}</span><a href="https://github.com/jo32/DeepDeck">GitHub ↗</a></footer>
  </div>;
}
