import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text = fs.readFileSync(new URL('../apps/web/public/research/benchmarks/models-full-2026-09-23.json', import.meta.url), 'utf8');
const data = JSON.parse(text);
const model = id => data.models.find(m => m.id === id);

test('published runs retain scores, timeouts, and incomplete usage and priced cost bounds', () => {
  assert.equal(data.models.length, 5);
  for (const m of data.models) {
    assert.equal(m.tasks.length, 49);
    assert.equal(new Set(m.tasks.map(t => `${t.site}/${t.id}`)).size, 49);
  }
  assert.deepEqual(model('luna').arms, { on: { passed: 49, timeouts: 0 }, off: { passed: 49, timeouts: 0 } });
  assert.deepEqual(model('mimo').arms, { on: { passed: 49, timeouts: 0 }, off: { passed: 46, timeouts: 3 } });
  for (const id of ['id-8', 'hev-9']) {
    const row = model('mimo').tasks.find(t => t.id === id).off;
    assert.equal(row.tokens, null);
    assert.equal(row.usageComplete, false);
    assert(row.usage.input + row.usage.cached + row.usage.output > 0);
  }
  for (const id of ['luna', 'mimo']) {
    const m = model(id);
    assert.equal(m.pricing.status, 'estimated');
    assert.equal(m.pricing.currency, 'USD');
    const rates = id === 'luna' ? { input: .2, cached: .02, write: .25, output: 1.2 } : { input: .14, cached: .0028, write: 0, output: .28 };
    for (const t of m.tasks) for (const arm of ['on', 'off']) {
      const r = t[arm];
      const expected = Object.entries(rates).reduce((n, [k, rate]) => n + r.usage[k] * rate / 1e6, 0);
      assert(Math.abs(r.cost.recordedSubtotal - expected) < 1e-10);
      assert.equal(r.cost.total, r.usageComplete ? expected : null);
    }
    for (const arm of ['on', 'off']) {
      const expected = m.tasks.reduce((n, t) => n + t[arm].cost.recordedSubtotal, 0);
      assert(Math.abs(m.costSummary[arm].cost.recordedSubtotal - expected) < 1e-10);
      assert.equal(m.costSummary[arm].cost.total === null, id === 'mimo' && arm === 'off');
    }
  }
});

test('common efficiency is an audited, equal-work subset', () => {
  assert.equal(data.commonComparison.taskIds.length, 43);
  assert.equal(data.lunaMimoComparison.taskIds.length, 45);
  for (const m of data.models) {
    const tasks = m.tasks.filter(t => data.commonComparison.taskIds.includes(`${t.site}/${t.id}`));
    assert.equal(tasks.length, 43);
    assert(tasks.every(t => t.eligible));
    const totals = data.commonComparison.totals.find(x => x.id === m.id);
    for (const arm of ['on', 'off']) for (const key of ['tokens', 'seconds', 'steps', 'toolCalls']) {
      assert(tasks.every(t => typeof t[arm][key] === 'number' && t[arm].passed));
      assert(Math.abs(tasks.reduce((s, t) => s + t[arm][key], 0) - totals[arm][key]) < 1e-6);
    }
  }
  assert.equal(model('luna').tasks.find(t => t.id === 'ea-7').eligible, false);
  assert.equal(model('luna').tasks.find(t => t.id === 'ea-7').off.passed, true);
  assert.equal(model('mimo').tasks.find(t => t.id === 'ea-7').eligible, true);
  assert.equal(model('mimo').sites.reduce((s, site) => s + site.pairs, 0), 46);
});

test('download omits private report content', () => {
  const forbidden = new Set(['finalText', 'transcript', 'password', 'apiKey', 'instances', 'sessionId']);
  function check(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert(!forbidden.has(key), `Private field: ${key}`);
      check(child);
    }
  }
  check(data);
  assert(!/\/Users\/|\/var\/folders\/|sk-[a-z0-9]{20}/i.test(text));
});
