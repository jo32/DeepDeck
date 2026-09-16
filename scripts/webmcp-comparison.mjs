/** Paired comparisons: WebMCP-on is the reference, never the correctness oracle. */
export function armOrder(mode, repeat = 0) {
  if (mode === 'compare') return repeat % 2 ? ['off', 'on'] : ['on', 'off'];
  if (mode === 'on' || mode === 'off') return [mode];
  throw new Error('--webmcp must be on, off, or compare.');
}
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function metrics(row) {
  const r = row?.result;
  const u = r?.usageComplete === true ? r.usage : null;
  const components = ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_creation_tokens'];
  return {
    totalTokens: u && components.every(key => finite(u[key])) ? components.reduce((sum, key) => sum + u[key], 0) : null,
    inputTokens: u && finite(u.input_tokens) ? u.input_tokens : null,
    outputTokens: u && finite(u.output_tokens) ? u.output_tokens : null,
    cachedInputTokens: u && finite(u.cached_input_tokens) ? u.cached_input_tokens : null,
    cacheCreationTokens: u && finite(u.cache_creation_tokens) ? u.cache_creation_tokens : null,
    agentMs: finite(r?.agentMs) ? r.agentMs : null,
    wallMs: finite(row?.wallMs) ? row.wallMs : null,
    resetMs: finite(row?.resetMs) ? row.resetMs : null,
    toolCalls: finite(r?.toolCalls) ? r.toolCalls : null,
  };
}
export function delta(reference, candidate) {
  if (!finite(reference) || !finite(candidate)) return null;
  return { on: reference, off: candidate, offMinusOn: candidate - reference,
    offOverOn: reference > 0 ? candidate / reference : null,
    webmcpReductionPercent: candidate > 0 ? (candidate - reference) / candidate * 100 : null };
}
const routes = row => [...new Set((row?.result?.routes ?? []).filter(route => typeof route.provider === 'string' && typeof route.model === 'string' && route.provider && route.model).map(route => JSON.stringify([route.provider, route.model])))].sort();
export function compareRows(rows, tasks, repeats) {
  const pairs = [];
  for (const task of tasks) for (let repeat = 0; repeat < repeats; repeat++) {
    const selected = rows.filter(row => row.site === task.site && row.taskId === task.id && row.repeat === repeat);
    const ons = selected.filter(row => row.arm === 'on'), offs = selected.filter(row => row.arm === 'off');
    const on = ons[0], off = offs[0];
    const finished = row => !!row?.result && !row.error && !row.result.failure && row.result.stopReason?.kind === 'completed';
    const complete = ons.length === 1 && offs.length === 1 && finished(on) && finished(off);
    const sameModel = routes(on).length > 0 && JSON.stringify(routes(on)) === JSON.stringify(routes(off));
    const sameBudget = on?.maxSteps === off?.maxSteps;
    const comparable = complete && sameModel && sameBudget;
    const onMetrics = metrics(on), offMetrics = metrics(off);
    pairs.push({ site: task.site, taskId: task.id, repeat, complete, sameModel, sameBudget, models: { on: routes(on), off: routes(off) }, comparable,
      baselineCorrect: on?.pass ?? null, bothCorrect: comparable && on.pass === true && off.pass === true,
      answers: { on: on?.result?.finalText ?? null, off: off?.result?.finalText ?? null },
      correctness: { on: on?.pass ?? null, off: off?.pass ?? null },
      metrics: { on: onMetrics, off: offMetrics },
      deltas: Object.fromEntries(Object.keys(onMetrics).map(key => [key, comparable ? delta(onMetrics[key], offMetrics[key]) : null])),
      note: !complete ? 'Missing, duplicate, failed or interrupted attempt; no efficiency comparison.' : !sameModel ? 'Model route differs or is unavailable; no efficiency comparison.' : !sameBudget ? 'Step budgets differ; no efficiency comparison.' : on.pass == null || off.pass == null ? 'Correctness is unscored; efficiency alone cannot establish task quality.' : on.pass !== true ? 'WebMCP reference did not pass the independent oracle; do not treat its answer as ground truth.' : null });
  }
  const aggregate = selected => ({ pairs: selected.length, metrics: Object.fromEntries(['totalTokens', 'agentMs', 'wallMs', 'toolCalls'].map(key => {
    const eligible = selected.filter(pair => pair.deltas[key]);
    return [key, { measuredPairs: eligible.length, totals: eligible.length ? delta(eligible.reduce((sum, pair) => sum + pair.metrics.on[key], 0), eligible.reduce((sum, pair) => sum + pair.metrics.off[key], 0)) : null }];
  })) });
  return { referenceArm: 'on', deltaConvention: 'off - on; positive means WebMCP used less',
    tokenAccounting: 'Harness input + output + cache-read + cache-write tokens; missing usage stays null. Token volume is not billed cost.',
    timeAccounting: 'agentMs includes Agent execution only. wallMs also includes isolated desktop startup/teardown. Site build/reset are separate.',
    pairedOrder: 'on/off on even repetitions, off/on on odd repetitions; each arm resets the same capsule and gets a fresh desktop/profile.',
    sampleWarning: repeats < 3 ? 'Fewer than three repetitions: descriptive measurements only, not a stable performance conclusion.' : 'Provider caching, load and model randomness still affect measurements.',
    pairs, completedPairs: pairs.filter(pair => pair.complete).length,
    allComparable: aggregate(pairs.filter(pair => pair.comparable)),
    bothCorrect: aggregate(pairs.filter(pair => pair.bothCorrect)) };
}
export function comparisonMarkdown(report) {
  const c = report.comparison;
  const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const lines = ['# WebMCP 对照报告', '', '基线：有 WebMCP（on）。正确性分别由题目评分器判断。', '', c.sampleWarning, '',
    '| 题目 / 重复 | 正确 on / off | token on / off | Agent 秒 on / off | Δ token（off − on） |', '|---|---|---|---|---|'];
  for (const p of c.pairs) lines.push(`| ${p.site}/${p.taskId} #${p.repeat + 1} | ${p.correctness.on} / ${p.correctness.off} | ${fmt(p.metrics.on.totalTokens)} / ${fmt(p.metrics.off.totalTokens)} | ${fmt(p.metrics.on.agentMs === null ? null : p.metrics.on.agentMs / 1000)} / ${fmt(p.metrics.off.agentMs === null ? null : p.metrics.off.agentMs / 1000)} | ${fmt(p.deltas.totalTokens?.offMinusOn)} |`);
  lines.push('', `两侧都答对且可比较：${c.bothCorrect.pairs} 对。`, '', '仅对两侧都答对的配对汇总节省比例：');
  for (const [key, metric] of Object.entries(c.bothCorrect.metrics)) lines.push(`- ${key}: ${fmt(metric.totals?.webmcpReductionPercent)}%，有效样本 ${metric.measuredPairs}。`);
  lines.push('', '答案与完整记录见 report.json。缺失用量不按零计算；token 总量不是实际费用。');
  return lines.join('\n') + '\n';
}
