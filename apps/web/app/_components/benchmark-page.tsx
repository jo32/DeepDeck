import Image from 'next/image';
import type { SiteLocale } from '../../lib/locale';
import { BenchmarkCorpus } from './benchmark-corpus';
import { BenchmarkUseCases } from './benchmark-use-cases';
import { BenchmarkFoundations, BenchmarkWebMCPIntro } from './benchmark-foundations';
import { BenchmarkModels } from './benchmark-models';
import { BenchmarkComparison } from './benchmark-comparison';
import { BenchmarkEvidence } from './benchmark-evidence';
import { BenchmarkPilot } from './benchmark-pilot';
import s from './benchmark.module.css';

export function BenchmarkPage({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  const t = (cn: string, en: string) => zh ? cn : en;
  const home = zh ? '/zh' : '/';
  const experiments = zh ? '/zh/webmcp/experiments' : '/webmcp/experiments';
  return <div className={s.page}>
    <a href="#results" className={s.skip}>{t('跳转到实测对比', 'Skip to measured results')}</a>
    <header className={s.header}><div className={s.headerInner}>
      <a className={s.brand} href={home} aria-label={t('DeepDeck 首页', 'DeepDeck home')}><Image src="/brand/mark.svg" alt="" width={27} height={27} priority /><span>DeepDeck <b>Bench</b></span></a>
      <nav aria-label={t('产品导航', 'Product navigation')}><a href="#capabilities">{t('能测什么', 'What you can test')}</a><a href="#tasks">{t('题库覆盖', 'Task corpus')}</a><a href="#results">{t('实测对比', 'Results')}</a><a href={zh ? '/zh/blog' : '/blog'}>{t('博客', 'Blog')}</a><a href="#pilot">{t('评测交付', 'Deliverables')}</a></nav>
      <div className={s.headerActions}><a className={s.language} href={zh ? '/benchmarks' : '/zh/benchmarks'} hrefLang={zh ? 'en' : 'zh-CN'} aria-label={zh ? 'Switch to English' : '切换为中文'}>{zh ? 'EN' : '中文'}</a><a className={s.headerCta} href="#apply">{t('申请试点', 'Apply for a pilot')} ↗</a></div>
    </div></header>
    <main>
      <section className={`${s.overview} ${s.shell}`} aria-labelledby="bench-title">
        <p className={s.eyebrow}>DEEPDECK BENCH · COMPUTER USE</p>
        <h1 id="bench-title">{t('测你的模型，', 'Benchmark your model.')}<br /><em>{t('验证你的 WebMCP。', 'Validate your WebMCP.')}</em></h1>
        <p className={s.overviewLead}>{t('用同一套 Computer Use Harness，评测模型使用网站的能力，检验 WebMCP 带来的增量。', 'Use one computer-use harness to evaluate how well a model uses websites and measure the contribution of WebMCP.')}</p>
        <p className={s.overviewCopy}>{t('接入模型和任务集，或输入网站与 query 自动运行 WebMCP 开关对照。报告保留两组答案、完成情况、token 用量与耗时。下面介绍评测方式、题库、实测结果和比较方法。', 'Connect a model and task suite, or provide a website and query for an automatic WebMCP on/off comparison. Reports retain answers, completion, tokens and time. Explore the evaluation modes, task corpus, measured results and comparison methods below.')}</p>
      </section>
      <nav className={`${s.pageMap} ${s.shell}`} aria-labelledby="page-map-title">
        <div className={s.pageMapHeading}><h2 id="page-map-title">{t('本页目录', 'On this page')}</h2><span>{t('从能力、题库到实测与交付，点击跳转。', 'Explore capabilities, tasks, results and deliverables.')}</span></div>
        <ol>{[
          ['why-webmcp', t('WebMCP 是什么', 'What is WebMCP'), t('网站如何向模型提供工具', 'How websites expose tools to models')],
          ['capabilities', t('这个 Benchmark 评什么', 'What we evaluate'), t('模型能力与 WebMCP 的价值', 'Model capability and WebMCP value')],
          ['method', t('如何评', 'How we evaluate'), t('对照条件、评分与指标', 'Controls, scoring and metrics')],
          ['results', t('实测结论', 'Measured results'), t('五模型全题库与四组实验', 'Five full-corpus models & four experiments')],
          ['tasks', t('题库', 'Task corpus'), t('网站、题目与任务类型', 'Websites, tasks and categories')],
          ['faq', t('常见问题', 'FAQ'), t('模型支持与结果解读', 'Model support and interpretation')],
          ['pilot', t('试点', 'Pilot'), t('交付材料与申请方式', 'Deliverables and application')]

        ].map(([id, title, description], i) => <li key={id}><a href={`#${id}`}><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div><strong>{title}</strong><small>{description}</small></div></a></li>)}</ol>
      </nav>

      <BenchmarkWebMCPIntro locale={locale} />
      <BenchmarkUseCases locale={locale} />
      <BenchmarkFoundations locale={locale} />

      <section id="results" className={s.resultsBand} aria-labelledby="results-title"><div className={s.shell}><div className={s.sectionHeading}><div><p className={s.eyebrow}>SUCCESS × TOKENS × TIME</p><h2 id="results-title">{t('实测结论', 'Measured results')}</h2></div><p>{t('Terra、DeepSeek v4.1 Flash、Hy3、Luna 与 MiMo V2.6 Flash 均测试了同一套 49 题。一起看成功率、token 和耗时，也保留超时、评分疑点与环境补跑记录。', 'Terra, DeepSeek v4.1 Flash, Hy3, Luna and MiMo V2.6 Flash were tested on the same 49-task corpus. Compare pass rates, tokens and time, with timeouts, scoring caveats and environment reruns disclosed.')}</p></div><BenchmarkModels locale={locale} /><details className={s.sampleDisclosure}><summary>{t('其他四组实验：Books、X、HN、OpenAI', 'Four other experiments: Books, X, HN, OpenAI')}<span aria-hidden="true">+</span></summary><BenchmarkComparison locale={locale} /></details><details id="sample" className={s.sampleDisclosure}><summary>{t('评分样例：HN 任务为什么没有完整通过？', 'Scoring example: why did the HN task not fully pass?')}<span aria-hidden="true">+</span></summary><p>{t('一次 CU 运行中，100 条正文正确，但仅 25 条回复关系得到确认。展开检查各项要求与核验依据。', 'In one CU run, all 100 text entries were correct, but only 25 reply relationships were confirmed. Inspect the requirements and evidence below.')}</p><BenchmarkEvidence locale={locale} /></details><a className={s.evidenceLink} href={experiments}>{t('查看完整实验报告与运行条件', 'Read the full experiments and run conditions')} ↗</a></div></section>

      <BenchmarkCorpus locale={locale} />

      <section className={`${s.faqSection} ${s.shell}`} id="faq" aria-labelledby="faq-title"><div><p className={s.eyebrow}>READ THE METRICS CORRECTLY</p><h2 id="faq-title">{t('关于评测的', 'Questions about')}<br />{t('常见问题', 'the evaluation')}</h2></div><div className={s.faq}>{[[t("WebMCP 一定用最少的步骤吗？", "Does WebMCP always use the fewest steps?"), t("不一定。知道有哪些功能、怎么调用，通常能减少找按钮和试错。我们会记录实际找到并验证过的做法，但不把它说成唯一或最优的做法。步骤最少，也不一定最省 token 或最快。", "No. Knowing the available functions and how to call them can reduce searching and retries. We record methods that have been tested, without claiming they are the only or best methods. The fewest steps may not mean the fewest tokens or the least time.")], [t("为什么文本模型也能参加？", "Why can a text model take part?"), t("如果所需信息能用文字返回，操作能通过工具完成，模型就不必看懂截图。它仍需要理解任务、选择功能和检查答案。需要判断图片内容的任务，要用另外的评分方法。", "If information is returned as text and actions are available through tools, the model does not need to interpret screenshots. It must still understand the task, choose functions, and check the answer. Tasks that require judging images need a separate evaluation method.")], [t("这能说明 Agent 还有多少提升空间吗？", "Can this show where an agent can improve?"), t("能提供一个实际比较对象。WebMCP 做完而 CU 没做完，说明当时存在一种可行做法。两组都做完，就可以比较步骤、token 和耗时。差距可能来自可用信息、工具、规划或页面操作，不能全部算作视觉能力的差距。", "It provides a tested comparison. If WebMCP finishes and CU does not, a working method existed under those conditions. If both finish, compare actions, tokens, and time. Differences may come from available information, tools, planning, or interface actions—not vision alone.")], [t("提交申请后会怎样？", "What happens after I apply?"), t("我们会通过你填写的邮箱联系你，确认要测哪些任务、比较哪些版本、交付什么结果，以及价格和时间。提交申请不会扣费，也不会自动开通服务。", "We will contact you at the email you provide to agree on tasks, versions, deliverables, pricing, and timing. Applying does not charge you or activate a service.")]].map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>

      <section id="pilot" aria-label={t('交付与申请', 'Deliverables and pilot')}><div className={s.pilotBand} aria-labelledby="pilot-title"><div className={s.shell}><div className={s.sectionHeading}><div><p className={s.eyebrow}>YOUR EVALUATION PACKAGE</p><h2 id="pilot-title">{t('交付与申请', 'Deliverables & pilot')}</h2></div><p>{t('为 Agent 团队、模型团队和企业自动化团队构建任务集。用同一套标准比较版本，判断能力是否进步，以及进步需要多少额外资源。', 'Build a task suite for agent, model, or enterprise automation teams. Compare versions with consistent criteria and see whether capability improves—and what that improvement costs.')}</p></div><div className={s.deliverables}>{[[t('任务集与 Ground truth', 'Tasks & ground truth'), t('网站能力地图、任务快照、目标字段、业务规则与经过验证的结果校验器。', 'Site capability maps, task snapshots, target fields, business rules, and validated outcome evaluators.')], [t('WebMCP 消融报告', 'WebMCP ablation report'), t('同一模型开启／关闭 WebMCP 的配对结果、两组答案、实际工具调用、token 与 Agent 耗时；启动成本单独记录。', 'Paired WebMCP on/off runs of the same model, both answers, actual tool calls, tokens, and agent time; startup costs recorded separately.')], [t('CU 差距报告', 'CU gap report'), t('成功率、资源差距、失败消耗与逐任务证据，支持版本对比。', 'Success, resource gaps, failed-run usage, and task-level evidence for version comparisons.')], [t('预算与回归评测', 'Budget & regression evaluation'), t('按约定预算重复评测，观察成功率与资源用量的变化，记录环境和版本。', 'Repeat evaluation under agreed budgets; track success and resource usage with environment and version records.')]].map(([title, body], i) => <div key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{body}</p></div>)}</div><p className={s.pilotNote}>{t('当前为浏览器任务试点。任务范围、参考执行可行性、交付格式、维护期限与报价按需求确认。', 'Currently a browser-task pilot. Task scope, reference feasibility, delivery format, maintenance, and pricing are agreed per engagement.')}</p></div></div>

      <div id="apply" className={`${s.application} ${s.shell}`} aria-labelledby="apply-title"><div className={s.applyCopy}><p className={s.eyebrow}>BENCHMARK AGAINST WHAT’S POSSIBLE</p><h2 id="apply-title">{t('想测模型，或验证 WebMCP？', 'Evaluating a model or WebMCP?')}<br />{t('告诉我们要做哪些任务。', 'Tell us which tasks it should do.')}</h2><p>{t('告诉我们模型、目标网站和任务，或者你想验证的 WebMCP。可以比较模型版本，也可以设计开启／关闭工具的消融实验。', 'Tell us your model, target website and tasks, or the WebMCP you want to validate. Compare model versions or design an on/off tool ablation.')}</p><p>{t('想做 Computer Use 强化学习（RL），也欢迎联系我们。除公开题库外，我们还有大量私有 Computer Use 题目，可用于模型评测与 RL 训练。你可以在申请表中说明任务领域、训练目标和题目需求。', 'Working on reinforcement learning (RL) for computer use? Get in touch. Beyond the public corpus, we have an extensive private computer-use task collection for model evaluation and RL training. Describe your task domain, training goals, and task requirements in the application.')}</p><ol><li>{t('确定任务与成功标准', 'Define tasks and success criteria')}</li><li>{t('固定 Harness，选择模型对比或 WebMCP 消融', 'Fix the harness; compare models or ablate WebMCP')}</li><li>{t('比较各版本的结果、Token 和耗时', 'Compare each version’s results, tokens, and time')}</li></ol><a href={experiments}>{t('查看已有实测证据', 'Read the experimental evidence')} ↗</a></div><BenchmarkPilot locale={locale} /></div></section>
    </main>
    <footer className={`${s.footer} ${s.shell}`}><a className={s.brand} href={home}>DeepDeck <b>Bench</b></a><span>GROUND TRUTH · TOKENS · TIME</span><div><a href={zh ? '/zh/blog' : '/blog'}>{t('博客', 'Blog')}</a><a href={experiments}>{t('实验报告', 'Experiments')}</a><a href="https://github.com/jo32/DeepDeck">GitHub ↗</a></div></footer>
  </div>;
}
