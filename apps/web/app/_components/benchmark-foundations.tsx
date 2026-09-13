import type { SiteLocale } from '../../lib/locale';
import s from './benchmark.module.css';

export function BenchmarkFoundations({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  const steps = [
    [t('先弄清网站有哪些功能', 'List what the site can do'), t('能拿到源码时，我们先看代码和网站功能，确认能查什么、能改什么、什么结果才算正确。拿不到源码时，就要另外检查能覆盖哪些任务。', 'When source code is available, we inspect it and the site’s features to establish what can be read or changed and what counts as correct. Without source access, we assess which tasks can be covered.')],
    [t('告诉模型怎么使用这些功能', 'Tell the model how to use them'), t('用 WebMCP 列出可调用的功能，说明要填什么、会返回什么。模型可以直接选择功能，不必每次都从页面上找按钮。', 'WebMCP lists callable functions, their inputs, and their results. The model can choose a function without finding its button on the page each time.')],
    [t('少找按钮，少试错', 'Spend less time searching and retrying'), t('每多看一次页面、多尝试一次操作，都可能增加 token 和等待时间。直接调用功能可以减少这些步骤。能省多少，要实际运行后比较。', 'Each extra page observation or attempted action can add tokens and waiting time. Calling a function directly can reduce these steps. We measure the savings by running the task.')],
    [t('不看截图，也能完成参考任务', 'Run the reference without screenshots'), t('只要任务所需的信息和操作都能用文字与工具提供，支持工具调用的文本模型就能尝试完成任务。这样可以测出：不需要找按钮、识别截图时，任务要花多少 token 和时间。', 'If the required information and actions are available as text and tools, a tool-capable text model can attempt the task. This measures the tokens and time needed without locating buttons or interpreting screenshots.')],
  ];
  return <section id="why-webmcp" className={`${s.section} ${s.shell}`} aria-labelledby="why-title">
    <div className={s.sectionHeading}><div><p className={s.eyebrow}>WHY WEBMCP</p><h2 id="why-title">{t('模型知道怎么调用功能，', 'When the model can call a function,')}<br />{t('就能少花时间找按钮。', 'it spends less time finding buttons.')}</h2></div><p>{t('例如，任务是找出网站上最便宜的三本书。CU 通常需要浏览页面、找到翻页入口，再读取价格。我们可以用 WebMCP 提供查书和读价格的工具，让模型直接获取所需信息。然后比较：两种方式是否都答对，各花了多少 token 和时间。', 'Suppose the task is to find the three cheapest books on a site. CU typically browses pages, finds pagination controls, and reads prices. We can provide book lookup and price-reading tools through WebMCP. Then we compare whether both methods answer correctly and how many tokens and how much time each uses.')}</p></div>
    <div className={s.foundationSteps}>{steps.map(([title, body], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    <div className={s.pathDiagram}>
      <div className={s.pathDiagramHeading}><h3>{t('同一件事，可以怎么完成？', 'How can each method complete the task?')}</h3><span>{t('流程示意，不代表实际操作次数', 'ILLUSTRATION, NOT ACTUAL ACTION COUNTS')}</span></div>
      <div className={s.pathLane}><span>COMPUTER USE</span><ol>{[t('查看页面', 'Read the page'), t('找到按钮', 'Find the control'), t('点击或输入', 'Click or type'), t('检查变化，必要时重试', 'Check the change and retry if needed'), t('检查答案', 'Check the answer')].map(x => <li key={x}>{x}</li>)}</ol></div>
      <div className={`${s.pathLane} ${s.shortPath}`}><span>WEBMCP</span><ol>{[t('查看可用功能', 'Read the available functions'), t('选择并调用功能', 'Choose and call a function'), t('检查返回结果', 'Check the result')].map(x => <li key={x}>{x}</li>)}</ol></div>
      <p>{t('这让我们能回答一个具体问题：模型已经知道有哪些功能、怎么调用时，完成任务需要多少资源？再拿这个结果与 CU 比较，就能看到多花的时间和 token。', 'This answers a specific question: how many resources does the task need when the model already knows the available functions and how to call them? Comparing that result with CU reveals the extra time and tokens.')}</p>
    </div>
    <p className={s.foundationNote}>{t('这些工具需要我们根据网站功能构建并检查。WebMCP 不会自动读懂全部源码，也不保证一定找到最短步骤。', 'We must build and check these tools against the site’s features. WebMCP does not automatically understand all source code or guarantee the fewest steps.')} <a href="https://github.com/webmachinelearning/webmcp">{t('查看 WebMCP 说明', 'Read about WebMCP')} ↗</a></p>
  </section>;
}
