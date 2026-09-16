import type { SiteLocale } from '../../lib/locale';
import s from './benchmark.module.css';

export function BenchmarkFoundations({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  const steps = [
    [t('固定条件，只切换 WebMCP', 'Fix conditions; toggle WebMCP'), t('同一模型、Harness、任务和步数预算，每轮新会话并交替执行顺序。两组都可操作页面，开启组额外获得 WebMCP 工具。', 'Use the same model, harness, task and step budget, with fresh sessions and alternating order. Both arms can interact with pages; the on arm also receives WebMCP tools.')],
    [t('独立检查完成情况', 'Check completion independently'), t('标准答案与 Agent 隔离，逐项核对任务要求。没有标准答案时标为未评分；人工确认的结果注明来源，不把开启组自动视为正确。', 'Keep expected answers separate from the agent and check each requirement. Without an expected answer, mark correctness unscored; attribute manual judgments. The on arm is not automatically correct.')],
    [t('比较 token 与耗时', 'Compare tokens and time'), t('记录累计 token、Agent 耗时、工具调用与错误，失败消耗也保留。Token 不等于费用；启动成本单列。线上内容未重置、任务完成量不同等限制随报告说明。', 'Retain accumulated tokens, agent time, tool calls and errors, including failed-run usage. Tokens are not monetary cost; startup is recorded separately. Reports disclose live-state and unequal-completion limits.')],
  ];
  return <section id="method" className={`${s.section} ${s.shell}`} aria-labelledby="method-title">
    <span id="design" />
    <div className={s.sectionHeading}><div><p className={s.eyebrow}>HOW WE EVALUATE</p><h2 id="method-title">{t('如何评：固定条件，检查结果。', 'How we evaluate: fix conditions, check outcomes.')}</h2></div><p>{t('模型评测固定任务和工具，比较模型或版本；WebMCP 消融固定模型，只切换工具是否可用。两类评测都先检查完成情况，再比较 token 与耗时。', 'Model benchmarks keep tasks and tools fixed while comparing models or versions. WebMCP ablation fixes the model and toggles tool availability. Both check completion before comparing tokens and time.')}</p></div>
    <div className={s.evaluationSteps}>{steps.map(([title, body], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
  </section>;
}

export function BenchmarkWebMCPIntro({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  return <section id="why-webmcp" className={`${s.section} ${s.shell}`} aria-labelledby="why-title">
    <div className={s.sectionHeading}><div><p className={s.eyebrow}>WHAT IS WEBMCP</p><h2 id="why-title">{t('WebMCP 是什么？', 'What is WebMCP?')}</h2></div><p>{t('WebMCP 让网站把搜索、查询和提交等功能作为工具提供给模型。模型可以直接调用这些功能，也可以继续操作页面。它可能减少找按钮和试错，但是否更好，需要实际评测。', 'WebMCP lets a website expose functions such as search, lookup and submission as tools for a model. The model can call them directly or keep interacting with the page. This may reduce searching and retries; whether it helps requires measurement.')}</p></div>
    <div className={s.pathDiagram}>
      <div className={s.pathDiagramHeading}><h3>{t('同一件事，可以怎么完成？', 'How can each method complete the task?')}</h3><span>{t('流程示意，不代表实际操作次数', 'ILLUSTRATION, NOT ACTUAL ACTION COUNTS')}</span></div>
      <div className={s.pathLane}><span>COMPUTER USE</span><ol>{[t('查看页面', 'Read the page'), t('找到按钮', 'Find the control'), t('点击或输入', 'Click or type'), t('检查变化，必要时重试', 'Check the change and retry if needed'), t('检查答案', 'Check the answer')].map(x => <li key={x}>{x}</li>)}</ol></div>
      <div className={`${s.pathLane} ${s.shortPath}`}><span>WEBMCP</span><ol>{[t('查看可用功能', 'Read the available functions'), t('选择并调用功能', 'Choose and call a function'), t('检查返回结果', 'Check the result')].map(x => <li key={x}>{x}</li>)}</ol></div>
      <p>{t('消融实验检验的是：额外提供这些功能，是否真的让同一个模型更高效？模型可以混合使用 WebMCP 与页面操作，结果也可能持平或变差。', 'The ablation asks whether offering these functions actually makes the same model more efficient. It may mix WebMCP with page interactions, and results may be unchanged or worse.')}</p>
    </div>
    <p className={s.foundationNote}>{t('这些工具需要我们根据网站功能构建并检查。WebMCP 不会自动读懂全部源码，也不保证一定找到最短步骤。', 'We must build and check these tools against the site’s features. WebMCP does not automatically understand all source code or guarantee the fewest steps.')} <a href="https://github.com/webmachinelearning/webmcp">{t('查看 WebMCP 说明', 'Read about WebMCP')} ↗</a></p>
  </section>;
}
