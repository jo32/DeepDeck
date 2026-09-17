import corpus from '../../lib/benchmark-corpus.json';
import type { SiteLocale } from '../../lib/locale';
import s from './benchmark.module.css';

export function BenchmarkUseCases({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  return <section id="capabilities" className={`${s.section} ${s.shell}`} aria-labelledby="capabilities-title">
    <div className={s.sectionHeading}><div><p className={s.eyebrow}>ONE HARNESS. TWO EVALUATIONS.</p><h2 id="capabilities-title">{t('这个 Benchmark 评什么？', 'What does this benchmark evaluate?')}</h2></div><p>{t('把 Codex app 中熟悉的“观察页面、调用工具、操作界面、检查结果”工作方式用于评测。你选择模型和任务，DeepDeck 自动执行并记录结果。', 'Bring the observe, use tools, interact, and verify workflow familiar from Codex app to evaluation. Choose a model and task; DeepDeck runs it and records the results.')}</p></div>
    <dl className={s.evaluationScope}>
      <div><dt>{t('为什么需要评测', 'Why benchmark?')}</dt><dd>{t('模型能回答问题，不代表能在网站上完成任务；网站提供了 WebMCP，也不代表模型一定能用更少的 token 或更短的时间完成任务。用同一批任务比较完成情况、token 和耗时，为选模型、改工具和检查版本退步提供依据。', 'Answering a question does not establish that a model can complete a website task, and exposing WebMCP does not guarantee that the model will complete the task with fewer tokens or in less time. Compare completion, tokens and time on a shared task set to choose models, improve tools and detect regressions.')}</dd></div>
      <div><dt>{t('用什么评测集', 'Which task sets?')}</dt><dd>{t(`内置 ${corpus.sites.length} 个开源网站的 ${corpus.total} 道任务，覆盖内容查询、搜索筛选、购物、预约、课程和业务流程。可修改本地题目文件构建自己的评测集，也可输入线上网站与 query 做单任务消融。`, `The built-in corpus has ${corpus.total} tasks across ${corpus.sites.length} open-source websites, covering reading, search, shopping, appointments, courses and business workflows. Edit local task files to build your own suite, or enter a live website and query for a single-task ablation.`)} <a href="#tasks">{t('查看题库', 'Explore the corpus')} →</a></dd></div>
      <div><dt>{t('评测需要哪些功能', 'What supports the evaluation?')}</dt><dd>{t('配置模型、Base URL 和 Key；自动管理本地示例启停；按任务执行并校验结果；切换 WebMCP、重复配对运行；保存答案、工具调用、token 和耗时。无工具或无标准答案时明确标注，便于区分环境问题与模型表现。', 'Configure a model, Base URL and key; manage local site lifecycles; execute tasks and check outcomes; toggle WebMCP and repeat paired runs; retain answers, tool calls, tokens and time. Missing tools or expected answers are explicitly marked to distinguish setup issues from model performance.')}</dd></div>
    </dl>
    <div className={`${s.truthCards} ${s.useCaseCards}`}>
      <article><span>01 / MODEL BENCHMARK</span><h3>{t('这个模型能把网站用好吗？', 'How well can your model use a website?')}</h3><p>{t('接入模型、Base URL 和 API Key，用 DeepDeck 的 Computer Use Harness 自动执行网站任务。在固定工具、任务和预算下比较模型或版本，记录答案、完成情况、token 用量和耗时。', 'Connect a model, Base URL, and API key. DeepDeck’s computer-use harness runs website tasks automatically. Compare models or versions with fixed tools, tasks, and budgets, recording answers, completion, tokens, and time.')}</p><strong>{t('输入：模型 + 任务集 → 输出：逐任务评测报告', 'MODEL + TASK SUITE → PER-TASK REPORT')}</strong><pre aria-label={t('模型评测命令示例', 'Model benchmark command example')}><code>{String.raw`pnpm benchmark:webmcp run \
  --sites tailwind-nextjs-blog \
  --provider deepseek-official \
  --model deepseek-flash \
  --webmcp off --n 3`}</code></pre></article>
      <article><span>02 / WEBMCP ABLATION</span><h3>{t('你的 WebMCP 真的有用吗？', 'Does your WebMCP actually help?')}</h3><p>{t('输入网站和 query，同一模型、同一 Computer Use Harness 自动运行开启／关闭 WebMCP 两组。开启组仍可操作页面，关闭组禁用 WebMCP；通过消融实验测量工具带来的实际增量。', 'Enter a website and query. The same model and computer-use harness run with WebMCP on and off. The on arm can still use the page; the off arm disables WebMCP. This ablation measures the tools’ actual contribution.')}</p><strong>{t('输入：网站 + QUERY → 输出：答案、TOKEN、耗时对照', 'WEBSITE + QUERY → ANSWERS, TOKENS & TIME')}</strong><pre aria-label={t('WebMCP 消融命令示例', 'WebMCP ablation command example')}><code>{String.raw`pnpm benchmark:webmcp ablate \
  --url https://your-site.example \
  --query "${t('在网站上查找最新消息', 'Find the latest news on this site')}" \
  --n 3`}</code></pre></article>
    </div>
    <p className={s.referenceDefinition}>{t('两项评测都基于 DeepSeek Harness 与 DeepDeck 的浏览器工具集。DeepSeek Harness 的 Browser Use 与 Codex app 采用相近的 Computer Use 交互方式：模型观察页面、调用工具、操作界面，再检查结果并继续执行。这里的相近指执行任务的方式，不代表两者使用同一套内部实现，也不代表已证明 SOTA 排名。', 'Both evaluations run on DeepSeek Harness and DeepDeck’s browser tools. DeepSeek Harness Browser Use follows a computer-use interaction pattern similar to Codex app: the model observes the page, calls tools, interacts with the interface, then checks the result before continuing. This similarity describes how tasks are carried out; it does not imply a shared internal implementation or an established SOTA ranking.')}</p>
    <p className={s.referenceDefinition}>{t('命令在本地运行。可使用网站自带的 WebMCP，或通过 --webmcp-file 指定自己的实现。没有工具时先报告不适用；没有标准答案时标为未评分。报告保留实际工具调用和两组答案，便于判断是否只是更快、还是完成得更好。', 'Commands run locally. Use site-native WebMCP or supply your implementation with --webmcp-file. Sites without tools are reported as not applicable; correctness stays unscored without an expected answer. Reports retain actual tool calls and both answers so you can distinguish speed from task quality.')}</p>
    <a className={s.evidenceLink} href="https://github.com/jo32/DeepDeck">{t('获取 DeepDeck 源码', 'Get the DeepDeck source')} ↗</a>
  </section>;
}
