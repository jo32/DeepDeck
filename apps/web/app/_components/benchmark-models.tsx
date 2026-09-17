'use client';

import { Fragment, useState } from 'react';
import type { SiteLocale } from '../../lib/locale';
import data from '../../public/research/benchmarks/models-full-2026-09-17.json';
import s from './benchmark-terra.module.css';

const fmt = (value: number | null, digits = 0): string => value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits });

const money = (value: number | null, currency: string) => value === null ? '—' : `${currency} ${value.toFixed(9).replace(/\.?0+$/, '') || '0'}`;
const usageKeys = ['input', 'cached', 'write', 'output'] as const;
const usageNames = { input: ['未命中输入', 'Uncached input'], cached: ['缓存命中输入', 'Cached input'], write: ['缓存写入', 'Cache write'], output: ['输出（含推理）', 'Output (incl. reasoning)'] };

// Use the intersection so every model's headline efficiency covers the same tasks.
const commonTasks = data.models[0].tasks.filter(task => data.models.every(model =>
  model.tasks.some(candidate => candidate.site === task.site && candidate.id === task.id && candidate.eligible && candidate.on.tokens !== null && candidate.off.tokens !== null)));
const commonTotals = data.models.map(model => ({
  ...model,
  totals: Object.fromEntries((['on', 'off'] as const).map(arm => [arm, commonTasks.reduce((sum, task) => {
    const result = model.tasks.find(candidate => candidate.site === task.site && candidate.id === task.id)![arm];
    return { tokens: sum.tokens + (result.tokens ?? 0), seconds: sum.seconds + (result.seconds ?? 0), steps: sum.steps + result.steps, toolCalls: sum.toolCalls + result.toolCalls, cost: sum.cost + (result.cost.total ?? 0) };
  }, { tokens: 0, seconds: 0, steps: 0, toolCalls: 0, cost: 0 })])),
}));

export function BenchmarkModels({ locale }: { locale: SiteLocale }) {
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en;
  const [selected, setSelected] = useState('terra');
  const [site, setSite] = useState('all');
  const [metric, setMetric] = useState<'tokens' | 'seconds'>('tokens');
  const model = data.models.find(item => item.id === selected) ?? data.models[0];
  const tasks = data.models[0].tasks.filter(task => site === 'all' || task.site === site);
  const max = Math.max(...model.sites.flatMap(item => [item.on[metric], item.off[metric]]));
  const saving = (on: number, off: number) => off === 0 ? '—' : `${fmt(Math.abs((off - on) / off * 100), 1)}% ${off >= on ? t('减少', 'less') : t('增加', 'more')}`;
  const notes = {
    terra: t('两组各 49/49 通过。首次运行有 5 次环境失败；修复就绪检查后，完整补跑 lh-6、lh-7、lh-8、id-3 的两组，共 8 次通过，最终使用替换配对。原始记录保留，环境失败与补跑消耗不计入效率。', 'Both arms passed 49/49. Five initial environment failures were followed by a readiness fix and paired reruns of lh-6, lh-7, lh-8 and id-3. All eight reruns passed and replace the original pairs. Original records are retained; environment failures and superseded attempts are excluded from efficiency totals.'),
    deepseek: t('开启组 48/49，关闭组 47/49。关闭组 blog-find-post 与 hev-9 均在 10 分钟后超时；开启组 md-7 回答了 3，但没有匹配评分器的格式正则，疑似评分误判，保留原判。没有改题或重跑模型失败。中途暂停后续跑，未完整落盘的尝试不计入统计。', 'On passed 48/49; off passed 47/49. Off timed out on blog-find-post and hev-9. On answered 3 for md-7 but missed the scorer’s format regex: a suspected scoring false negative, retained as scored. Model failures were not rerun and tasks were not changed. Runs resumed after pauses; unsaved partial attempts are excluded.'),
    hy3: t('开启组 49/49，关闭组 48/49。关闭组 hev-9 在 10 分钟后超时，累计 76 次工具调用，保留失败。lh-8 关闭组曾遇接口限流，等待恢复后单独重试通过；该配对跨批次执行，原始限流记录保留。效率不含限流等待、被替换尝试和暂停时未落盘的执行。', 'On passed 49/49; off passed 48/49. Off timed out on hev-9 after 10 minutes and 76 tool calls; the failure is retained. Off on lh-8 hit an API rate limit, then passed a single-arm retry after the limit reset. This pair spans batches; the original error is retained. Efficiency excludes rate-limit waits, superseded attempts and unsaved interrupted execution.'),
  };
  return <article className={s.report} aria-labelledby="models-title">
    <div className={s.heading}><div><p className={s.kicker}>FULL CORPUS · 2026-09-16 / 17</p><h3 id="models-title">{t('三个模型，同一套 49 题', 'Three models, the same 49 tasks')}</h3><p>{t('完整默认工具能力，只切换 WebMCP。', 'Full default tools; only WebMCP changes.')}</p></div><span className={s.badge}>{t('8 个网站 · 每组每题 1 次', '8 sites · one run per task per arm')}</span></div>
    <div className={s.detailBody}>
      <h4 className={s.overviewTitle}>{t('先看绝对消耗，再看 WebMCP 节省多少', 'Compare absolute usage, then WebMCP savings')}</h4>
      <p className={s.note}>{t(`通过数覆盖全部 49 题。下表 token、耗时、步数和工具调用统一使用三个模型、两组都通过的同一批 ${commonTasks.length} 题，合计值越低表示本次消耗越少；节省百分比不是模型能力分数。`, `Pass counts cover all 49 tasks. Tokens, time, steps and tool calls below use the same ${commonTasks.length} tasks passed by all three models in both arms. Lower totals mean less usage in this run; savings percentages are not model capability scores.`)}</p>
      <div className={s.tableScroll} tabIndex={0} role="region" aria-label={t('模型结果总览', 'Model results overview')}><table className={s.crossTable}><thead><tr><th scope="col">{t('指标', 'Metric')}</th>{commonTotals.map(item => <th scope="col" key={item.id}>{item.name}</th>)}</tr></thead><tbody>
        <tr><th scope="row">{t('评分通过 · 全 49 题', 'Scorer passes · all 49')}<small>{t('开启 / 关闭 WebMCP', 'WebMCP on / off')}</small></th>{commonTotals.map(item => <td key={item.id}>{item.arms.on.passed}/49 · {item.arms.off.passed}/49</td>)}</tr>
        {(['on', 'off'] as const).map(arm => <Fragment key={arm}>
          <tr><th scope="row">{t('总 token', 'Total tokens')}<small>WebMCP {arm.toUpperCase()}</small></th>{commonTotals.map(item => <td key={item.id}>{fmt(item.totals[arm].tokens)}</td>)}</tr>
          <tr><th scope="row">{t('Agent 总耗时（秒）', 'Total Agent time (s)')}<small>WebMCP {arm.toUpperCase()}</small></th>{commonTotals.map(item => <td key={item.id}>{fmt(item.totals[arm].seconds, 1)}</td>)}</tr>
          <tr><th scope="row">{t('公网 API 费用估算', 'Public API cost estimate')}<small>WebMCP {arm.toUpperCase()}</small></th>{commonTotals.map(item => <td key={item.id}>{money(item.totals[arm].cost, item.pricing.currency)}</td>)}</tr>
          <tr><th scope="row">{t('Agent 总步数', 'Total Agent steps')}<small>WebMCP {arm.toUpperCase()}</small></th>{commonTotals.map(item => <td key={item.id}>{fmt(item.totals[arm].steps)}</td>)}</tr>
          <tr><th scope="row">{t('工具调用总次数', 'Total tool calls')}<small>WebMCP {arm.toUpperCase()}</small></th>{commonTotals.map(item => <td key={item.id}>{fmt(item.totals[arm].toolCalls)}</td>)}</tr>
        </Fragment>)}
        <tr><th scope="row">{t('WebMCP 的 token 收益', 'WebMCP token savings')}</th>{commonTotals.map(item => <td key={item.id}>{saving(item.totals.on.tokens, item.totals.off.tokens)}</td>)}</tr>
        <tr><th scope="row">{t('WebMCP 的耗时收益', 'WebMCP time savings')}</th>{commonTotals.map(item => <td key={item.id}>{saving(item.totals.on.seconds, item.totals.off.seconds)}</td>)}</tr>
      </tbody></table></div>
      <p className={s.note}>{t('开启／关闭均指整个 Agent 的消耗，不是 WebMCP 工具单独的消耗。跨模型的 token 分词方式、接口延迟和运行环境存在差异；这里展示实测绝对值，不等同于费用或严格能力排名。', 'On/off values cover the whole Agent, not WebMCP tool overhead alone. Tokenizers, API latency and environments differ across models. These are observed absolute values, not billed costs or a strict capability ranking.')}</p>
    </div>
    <p className={s.note}>{t('步数 = Agent 开始的模型推理步骤数；工具调用 = 实际发出的调用次数，包含失败调用。一轮可能调用多个工具，两者都不是页面点击次数。超时中断的已开始步骤也计数；每题仍只有 10 分钟上限，没有步数限制。', 'Steps count model reasoning steps started by the Agent; tool calls count calls issued, including failed calls. One step may call multiple tools; neither is a page-click count. Started steps interrupted by timeout are counted. The limit remains 10 minutes, with no step limit.')}</p>
    <details className={s.disclosure}><summary>{t('API 单价、49 题费用合计与计价说明', 'API rates, all-49-task costs & accounting')}<span>2026-09-17 ＋</span></summary><div className={s.detailBody}>
      <p className={s.note}>{t('按公网 API 价估算模型 token 费用，不是本次订阅／代理账单。单价单位为每百万 token，所有单价与费用统一为 USD。Hy3 按付费 API 价格估算。', 'Model-token estimates at public API prices, not subscription/proxy bills. Rates are per million tokens with all rates and costs shown in USD. Hy3 is estimated at paid API rates.')}</p>
      <div className={s.tableScroll} tabIndex={0} role="region" aria-label={t('API 单价与费用', 'API rates and costs')}><table className={s.crossTable}><thead><tr><th scope="col">{t('价格 / 项目', 'Rate / item')}</th>{data.models.map(item => <th key={item.id} scope="col">{item.name}<small>{item.pricing.currency}</small></th>)}</tr></thead><tbody>
        {usageKeys.map(key => <tr key={key}><th scope="row">{usageNames[key][locale === 'zh' ? 0 : 1]}<small>{t('每百万 token', 'per million tokens')}</small></th>{data.models.map(item => <td key={item.id}>{item.pricing.rates[key] === null ? t('未单列费率', 'No separate rate') : money(item.pricing.rates[key], item.pricing.currency)}</td>)}</tr>)}
        {(['on', 'off'] as const).map(arm => <tr key={arm}><th scope="row">{t('全部 49 题', 'All 49 tasks')}<small>WebMCP {arm.toUpperCase()}</small></th>{data.models.map(item => <td key={item.id}>{item.costSummary[arm].cost.total === null ? '≥ ' : ''}{money(item.costSummary[arm].cost.recordedSubtotal, item.pricing.currency)}<small className={s.absoluteTime}>{item.costSummary[arm].completeAttempts}/49 {t('条用量完整', 'complete usage records')}</small></td>)}</tr>)}
        <tr><th scope="row">{t('官方单价来源', 'Official price source')}</th>{data.models.map(item => <td key={item.id}><a href={item.pricing.source} target="_blank" rel="noreferrer">{item.pricing.label} ↗</a></td>)}</tr>
      </tbody></table></div>
      <p className={s.note}>{t('Terra 使用 Standard 短上下文价，本次单次输入均小于 40k。DeepSeek 使用谷价，本次运行均在工作日 UTC 01–04、06–10 高峰窗口之外；峰价为输入 $0.30、缓存命中 $0.006、输出 $1.20 / 百万 token。Hy3 使用腾讯云 TokenHub 广州按量价。', 'Terra uses Standard short-context rates; every observed input is below 40k. DeepSeek uses off-peak rates: recorded runs are outside weekday UTC 01–04 and 06–10 peak windows. Peak rates per million tokens are $0.30 input, $0.006 cached input and $1.20 output. Hy3 uses TokenHub Guangzhou pay-as-you-go pricing.')}</p>
      <p className={s.note}>{t('费用 = 各类 token × 对应单价 ÷ 1,000,000。输入已扣除缓存命中，避免重复计费；输出已包含推理 token，不额外再加。所有记录的缓存写入为 0，未单列费率不表示未来写入免费。49 题合计包含最终失败尝试；用量不全时仅列已记录下限。环境补跑的被替换尝试、税费、外部工具费和基础设施不在估算内；表格显示最多 9 位小数，下载数据保留分项。', 'Cost = each token category × its rate / 1,000,000. Uncached input excludes cache hits; output already includes reasoning, with no second charge. All recorded cache writes are zero; an unspecified write rate does not imply free future writes. All-49 totals include final failed attempts; incomplete usage yields a recorded lower bound only. Superseded attempts, tax, external tool fees and infrastructure are excluded. Up to nine decimals are shown; downloads retain components.')}</p>
      <p className={s.note}>{t('Hy3 原始人民币单价按 1 USD = 6.7065 CNY 换算（2026-09-16 行情，固定用于本次估算）：USD 金额 = CNY 金额 ÷ 6.7065。不是腾讯云另行公布的美元套餐价格。', 'Hy3 CNY tariffs are converted at 1 USD = 6.7065 CNY (2026-09-16 observation, fixed for this estimate): USD = CNY / 6.7065. This is not a separate Tencent USD tariff.')} <a href="https://cincodias.elpais.com/mercados/divisas/dolar-usa-yuan/" target="_blank" rel="noreferrer">{t('汇率来源', 'FX source')} ↗</a></p>
    </div></details>
    <details className={s.disclosure} open><summary>{t('逐题横向对比 · 三个模型', 'Task comparison · all three models')}<span>49 {t('题', 'tasks')} ＋</span></summary><div className={s.detailBody}>
      <label className={s.filter}>{t('筛选网站', 'Filter by site')}<select value={site} onChange={event => setSite(event.target.value)}><option value="all">{t('全部网站', 'All sites')}</option>{data.models[0].sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>{tasks.length} {t('题', 'tasks')}</span></label>
      <p className={s.note}>{t('每题上下两行分别为开启／关闭 WebMCP，三个模型始终并排。每格展示完整 token 数、Agent 秒数、步数、工具调用次数和评分；超时与失败仍展示实际消耗，缺失用量显示 —。窄屏可横向滚动。', 'Each task has WebMCP on/off rows, with all three models side by side. Cells show exact token counts, Agent seconds, steps, tool calls and score. Timeouts and failures retain observed usage; missing usage is —. Scroll horizontally on narrow screens.')}</p>
      <div className={`${s.tableScroll} ${s.taskScroll}`} tabIndex={0} role="region" aria-label={t('逐题对照表', 'Task comparison table')}><table className={s.crossTable}><thead><tr><th scope="col">{t('题目 / WebMCP', 'Task / WebMCP')}</th>{data.models.map(item => <th scope="col" key={item.id}>{item.name}</th>)}</tr></thead><tbody>{tasks.map(task => <Fragment key={`${task.site}/${task.id}`}>
        <tr className={s.taskHeading}><th colSpan={4} scope="rowgroup"><small>{task.id} · {data.models[0].sites.find(item => item.id === task.site)?.name}</small>{task.title[locale]}</th></tr>
        {(['on', 'off'] as const).map(arm => <tr key={arm}><th scope="row"><span className={s.armLabel}>WebMCP {arm.toUpperCase()}</span></th>{data.models.map(item => {
          const result = item.tasks.find(candidate => candidate.site === task.site && candidate.id === task.id)![arm];
          return <td key={item.id}><strong className={s.absoluteValue}>{fmt(result.tokens)} <small>token</small></strong><span className={s.absoluteTime}>{fmt(result.seconds, 1)} {t('秒', 's')}</span><span className={s.absoluteTime}>{fmt(result.steps)} {t('步', 'steps')} · {fmt(result.toolCalls)} {t('次工具调用', 'tool calls')}</span><span className={s.absoluteTime}>{result.cost.total === null ? '≥ ' : ''}{money(result.cost.recordedSubtotal, item.pricing.currency)} {t('估算', 'est.')}</span><details className={s.costDetails}><summary>{t('输入／输出／缓存与费用', 'Input / output / cache & cost')}</summary>
            {!result.usageComplete && <p>{t('仅已记录用量，非完整费用。', 'Recorded usage only; cost is incomplete.')}</p>}
            <dl>{usageKeys.map(key => <div key={key}><dt>{usageNames[key][locale === 'zh' ? 0 : 1]}</dt><dd>{fmt(result.usage[key])} token<br />{item.pricing.rates[key] === null ? t('本次写入 0', 'Zero writes recorded') : `${fmt(item.pricing.rates[key], 6)} / 1M`} → {money(result.cost.parts[key], item.pricing.currency)}</dd></div>)}</dl>
            <p>{t('缓存命中率（输入）', 'Input cache-hit rate')}：{fmt(result.cacheHitPercent, 2)}{result.cacheHitPercent === null ? '' : '%'}</p>
          </details><span className={result.passed ? s.passStatus : s.failStatus}>{result.timedOut ? t('超时', 'Timeout') : result.passed ? t('通过', 'Passed') : t('未通过', 'Failed')}</span></td>;
        })}</tr>)}
      </Fragment>)}</tbody></table></div>
    </div></details>
    <details className={s.disclosure}><summary>{t('按网站查看收益', 'Gains by site')}<span>8 {t('个网站', 'sites')} ＋</span></summary>
      <div className={s.detailBody}><label className={s.filter}>{t('网站图表模型', 'Model for site chart')}<select value={selected} onChange={event => setSelected(event.target.value)}>{data.models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className={s.chartHead}><h4>{model.name}</h4><div role="group" aria-label={t('选择对比指标', 'Select comparison metric')}><button type="button" aria-pressed={metric === 'tokens'} onClick={() => setMetric('tokens')}>Token</button><button type="button" aria-pressed={metric === 'seconds'} onClick={() => setMetric('seconds')}>{t('Agent 耗时', 'Agent time')}</button></div></div>
      <p className={s.legend}><span><i className={s.on} />WebMCP ON</span><span><i className={s.off} />WebMCP OFF</span><span>{t('仅双方通过的配对合计', 'Both-pass pair totals only')}</span></p>
      <div className={s.chart}>{model.sites.map(item => <div className={s.site} key={item.id}><div className={s.siteName}><strong>{item.name}</strong><small>{t('效率样本', 'Efficiency pairs')} {item.pairs}/{item.count} · {t('通过', 'Pass')} {item.on.passed}/{item.off.passed}</small></div><div className={s.bars}>{(['on', 'off'] as const).map(arm => <div key={arm}><span>{arm.toUpperCase()}</span><div className={s.track} aria-hidden="true"><i className={s[arm]} style={{ width: `${item[arm][metric] / max * 100}%` }} /></div><b>{fmt(item[arm][metric], metric === 'seconds' ? 1 : 0)} {metric === 'seconds' ? t('秒', 's') : 'token'}</b></div>)}</div><span className={s.saving}>{saving(item.on[metric], item.off[metric])}</span></div>)}</div>
    </details>
    <details className={s.disclosure}><summary>{t('运行条件与解读边界', 'Run conditions & limitations')}<span>＋</span></summary><div className={s.detailBody}><dl className={s.conditions}>
      <div><dt>{t('控制变量', 'Controls')}</dt><dd>{t('相同 8 个本地网站、49 道题。每题每组 10 分钟，无步数限制。两组均有完整 DeepDeck 默认工具，包括 Chrome DevTools MCP；仅切换 WebMCP。每组重置网站，创建新会话与桌面配置，固定先开启、后关闭。校准题和自定义模板不在本次题库内。', 'The same 8 local sites and 49 tasks. Each arm has 10 minutes and no step limit. Both retain all DeepDeck default tools, including Chrome DevTools MCP; only WebMCP changes. Each arm resets the site and starts a fresh session/profile, always on then off. Calibration tasks and custom templates are excluded.')}</dd></div>
      <div><dt>{t('模型与接口', 'Models & interfaces')}</dt><dd>{t('Terra 通过 ChatGPT 登录使用 openai-codex / gpt-5.6-terra；DeepSeek 和 Hy3 通过本地 OpenAI 兼容代理，路由分别为 cn:deepseek-v4.1-flash、cn:hy3，均使用提供方默认推理设置。没有独立验证代理上游身份。接口不同也可能影响耗时。Terra 跨过环境就绪检查修复，包含两个题库版本；下载数据保留版本哈希。这不是同一构建下的严格跨模型排名。', 'Terra uses ChatGPT login via openai-codex / gpt-5.6-terra. DeepSeek and Hy3 use a local OpenAI-compatible proxy with cn:deepseek-v4.1-flash and cn:hy3. All use provider-default reasoning. Proxy upstream identities were not independently verified. Different interfaces can also affect latency. Terra spans two corpus revisions around an environment readiness fix; hashes are retained in the download. This is not a strict same-build cross-model ranking.')}</dd></div>
      <div><dt>{t('统计口径', 'Accounting')}</dt><dd>{t('总览统一使用三个模型六组均通过的同一批题目；网站图表使用该模型双方通过的题目。两者均为合计，不是中位数。Token 累计输入、输出和缓存读写，不等于费用；Agent 耗时不含网站构建、重置、桌面启动、限流等待和被替换尝试。每题仅一次，缓存、负载、模型随机性与执行顺序均可能影响结果。', 'The overview uses the common tasks passed by all six arms; site charts use each model’s own both-pass subset. Both show totals, not medians. Tokens sum input, output and cache reads/writes, not billed cost. Agent time excludes site build/reset, desktop startup, rate-limit waits and superseded attempts. One run per task: caching, load, randomness and order can affect results.')}</dd></div>
      <div><dt>{t('评分范围', 'Scoring scope')}</dt><dd>{t('通过代表满足现有评分器，不代表每项答案细节均已人工验证。例如 hev-9 只自动核验订单创建，订单状态文本仍需人工检查。DeepSeek md-7 的疑似格式误判保留原判，不自动把开启组答案当标准答案。', 'A pass means satisfying the existing scorer, not manual verification of every answer detail. For example, hev-9 checks order creation automatically; reported order status needs manual review. DeepSeek md-7 retains its suspected format-related false negative. WebMCP-on answers are not automatically ground truth.')}</dd></div>
      {data.models.map(item => <div key={item.id}><dt>{item.name}</dt><dd>{notes[item.id as keyof typeof notes]}</dd></div>)}
    </dl></div></details>
    <div className={s.footer}><p>{t('完整原始记录保留在本地；下载数据包含三模型逐题指标与统计条件。', 'Full raw records are retained locally. Download task metrics and conditions for all three models.')}</p><a href="/research/benchmarks/models-full-2026-09-17.json" download>{t('下载三模型评测数据', 'Download all three models')} ↓</a></div>
  </article>;
}
