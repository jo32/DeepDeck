import fs from 'node:fs';
import assert from 'node:assert/strict';

// Export metrics only: private reports also contain answers, session paths and traces.
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const baseline = read('apps/web/public/research/benchmarks/models-full-2026-09-17.json');
const luna = read('docs/benchmarks/gpt-luna-comparison-2026-09-22.json');
const mimo = read('docs/benchmarks/mimo-flash-comparison-2026-09-23.json');
assert(luna.complete && mimo.complete, 'Only completed runs can be published');
const arms = ['on', 'off'];
const keys = ['input', 'cached', 'write', 'output'];
const prices = {
  luna: { status: 'estimated', currency: 'USD', rates: { input: 0.20, cached: 0.02, write: 0.25, output: 1.20 }, source: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna', label: 'OpenAI GPT-5.6 Luna', checkedAt: '2026-09-23', basis: 'Standard API equivalent, not the ChatGPT subscription bill' },
  mimo: { status: 'estimated', currency: 'USD', rates: { input: 0.14, cached: 0.0028, write: null, output: 0.28 }, source: 'https://mimo.mi.com/models/zh-CN/mimo-v2.6-flash', label: 'Xiaomi MiMo V2.6 Flash', checkedAt: '2026-09-23', basis: 'Official overseas USD real-time API-equivalent tariff, not a currency conversion or domestic bill' },
};
// Verify the per-request threshold, not the cumulative task token count.
const lunaRaw = read('.deepdeck/benchmarks/luna-full-20260922/report.json');
const lunaRequests = lunaRaw.rows.flatMap(r => r.result.transcript.filter(e => e.type === 'assistant/message').map(e => e.data.usage));
assert(lunaRequests.every(u => u && Number.isFinite(u.inputTokens)));
prices.luna.maxObservedInputTokens = Math.max(...lunaRequests.map(u => u.inputTokens + (u.cacheReadTokens ?? 0)));
assert(prices.luna.maxObservedInputTokens <= 272000, 'Long-context pricing needs per-request accounting');
function cost(u, pricing, complete) {
  const parts = Object.fromEntries(keys.map(k => {
    assert(pricing.rates[k] !== null || u[k] === 0, `Unpriced nonzero usage: ${k}`);
    return [k, u[k] * (pricing.rates[k] ?? 0) / 1e6];
  }));
  const recordedSubtotal = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total: complete ? recordedSubtotal : null, recordedSubtotal };
}
const usage = u => ({ input: u.input_tokens, cached: u.cached_input_tokens, write: u.cache_creation_tokens, output: u.output_tokens });
const sum = (tasks, arm, key) => tasks.reduce((n, t) => n + t[arm][key], 0);

function convert(report, id, date) {
  const source = report[id];
  const findings = id === 'luna' ? report.auditFindings : report.audits;
  const tasks = source.tasks.map(task => {
    const result = { site: task.site, id: task.id, title: task.title };
    for (const arm of arms) {
      const r = task[arm];
      const u = usage(r.usage);
      const finding = findings.find(a => a.site === task.site && a.id === task.id && a.arm === arm);
      const audit = finding?.kind ?? (id === 'luna' && task.id === 'id-8' && arm === 'on' ? 'requested-ui-step-unverified' : null);
      result[arm] = {
        passed: r.passed, timedOut: r.timedOut, tokens: r.tokens, seconds: r.seconds,
        steps: r.steps, toolCalls: r.toolCalls, usage: u, usageComplete: r.usageComplete,
        cost: cost(u, prices[id], r.usageComplete), cacheHitPercent: u.input + u.cached > 0 ? u.cached / (u.input + u.cached) * 100 : null, audit,
      };
    }
    result.eligible = arms.every(arm => task[arm].passed && task[arm].completed && task[arm].correctRoute && task[arm].usageComplete)
      && !arms.some(arm => result[arm].audit && result[arm].audit !== 'verified-complete');
    return result;
  });
  assert.equal(tasks.length, 49);
  const sites = baseline.models[0].sites.map(site => {
    const rows = tasks.filter(t => t.site === site.id);
    const eligible = rows.filter(t => t.eligible);
    return { id: site.id, name: site.name, count: rows.length, pairs: eligible.length,
      ...Object.fromEntries(arms.map(arm => [arm, { passed: rows.filter(t => t[arm].passed).length,
        ...Object.fromEntries(['tokens', 'seconds', 'steps', 'toolCalls'].map(k => [k, sum(eligible, arm, k)])) }])) };
  });
  return {
    id, name: source.name, model: report.provenance.model, date, tasks, sites,
    arms: Object.fromEntries(arms.map(arm => [arm, { passed: tasks.filter(t => t[arm].passed).length, timeouts: tasks.filter(t => t[arm].timedOut).length }])),
    sourceReports: id === 'luna' ? 'gpt-luna-comparison-2026-09-22' : 'mimo-flash-comparison-2026-09-23',
    corpusHashes: [report.provenance.corpusSha256], taskSetSha256: report.provenance.taskSetSha256,
    pricing: prices[id],
    costSummary: Object.fromEntries(arms.map(arm => [arm, {
      usage: Object.fromEntries(keys.map(k => [k, tasks.reduce((n, t) => n + t[arm].usage[k], 0)])),
      completeAttempts: tasks.filter(t => t[arm].usageComplete).length, cost: cost(Object.fromEntries(keys.map(k => [k, tasks.reduce((n, t) => n + t[arm].usage[k], 0)])), prices[id], tasks.every(t => t[arm].usageComplete)),
    }])),
    reasoning: { requestedEffort: 'provider-default', effectiveEffort: id === 'mimo' ? 'enabled' : null, sameConfigurationAcrossArms: true },
  };
}

const models = [...baseline.models.map(m => ({ ...m, pricing: { ...m.pricing, status: 'estimated' },
  tasks: m.tasks.map(t => ({ ...t, on: { ...t.on, audit: null }, off: { ...t.off, audit: null } })) })),
  convert(luna, 'luna', '2026-09-22'), convert(mimo, 'mimo', '2026-09-23')];
const commonTaskIds = models[0].tasks.filter(t => models.every(m => m.tasks.some(x => x.site === t.site && x.id === t.id && x.eligible && arms.every(a => x[a].tokens !== null && x[a].seconds !== null))))
  .map(t => `${t.site}/${t.id}`);
assert.deepEqual(commonTaskIds, mimo.commonTaskIds, 'Published subset must match the audited report');
const commonTotals = models.map(m => {
  const tasks = m.tasks.filter(t => commonTaskIds.includes(`${t.site}/${t.id}`));
  return { id: m.id, tasks: tasks.length, ...Object.fromEntries(arms.map(a => [a, Object.fromEntries(['tokens', 'seconds', 'steps', 'toolCalls'].map(k => [k, sum(tasks, a, k)]))])) };
});
for (const m of commonTotals) for (const a of arms) for (const k of ['tokens', 'seconds', 'steps', 'toolCalls']) {
  assert(Math.abs(m[a][k] - mimo.commonTotals.find(x => x.id === m.id)[a][k]) < 1e-6, `Aggregate mismatch: ${m.id}/${a}/${k}`);
}
const data = {
  conditions: { ...baseline.conditions, dates: '2026-09-16 through 2026-09-23',
    efficiency: 'Same 43 tasks passed in both arms of all five models, with complete usage and known incomplete/unverified steps excluded. Site charts use each model’s own eligible pairs.',
    pricing: 'Historical three-model estimates retained. Luna uses Standard USD API-equivalent rates; MiMo uses official overseas USD real-time API-equivalent rates, checked 2026-09-23. Incomplete usage retains a recorded cost lower bound; null total never means zero cost.',
    limitations: 'Single attempts across dates/builds. Scorer passes are not exhaustive manual completion checks. MiMo calibration with thinking disabled is excluded.' },
  models, commonComparison: { taskIds: commonTaskIds, totals: commonTotals },
  lunaMimoComparison: { taskIds: mimo.lunaMatchedTaskIds, totals: mimo.lunaMatchedTotals, headline: mimo.headline },
};
const output = 'apps/web/public/research/benchmarks/models-full-2026-09-23.json';
fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
console.log(`${output}: ${models.length} models, ${commonTaskIds.length} common tasks`);
