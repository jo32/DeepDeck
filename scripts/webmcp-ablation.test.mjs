import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWebsiteAblation, validateAblationOptions, scoreAblationAnswer } from './webmcp-ablation.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'website-ablation-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, options: { url: 'https://example.com/about', query: 'Who is the author?', n: '2', 'settings-from': dir, output: join(dir, 'out') } };
}
const result = args => args.inspect ? { webmcp: args.webmcp, tools: args.webmcp === 'on' ? [{ name: 'read_page' }] : [] } : {
  webmcp: args.webmcp, initialTools: args.webmcp === 'on' ? [{ name: 'read_page' }] : [], finalText: 'Final answer: Aurora', failure: '', stopReason: { kind: 'completed' }, routes: [{ provider: 'test', model: 'test' }], usageComplete: true,
  usage: { input_tokens: 10, output_tokens: 1, cached_input_tokens: 0, cache_creation_tokens: 0 }, agentMs: 10, transcript: [],
};
test('one command performs both preflights, alternates paired arms and never guesses correctness', async t => {
  const { options } = await fixture(t), calls = [];
  const out = await runWebsiteAblation(options, { runAttempt: async args => { calls.push(args); return result(args); } });
  assert.equal(out.exitCode, 0);
  assert.ok(calls.every(x => x.timeoutMs === 600000 && !Object.hasOwn(x, 'maxSteps')));
  assert.deepEqual(calls.map(x => [x.inspect, x.webmcp]), [[true, 'on'], [true, 'off'], [false, 'on'], [false, 'off'], [false, 'off'], [false, 'on']]);
  assert.equal(new Set(calls.map(x => x.settingsFrom)).size, 1);
  await assert.rejects(access(calls[0].settingsFrom));
  assert.equal(out.report.comparison.allComparable.pairs, 2);
  assert.equal(out.report.comparison.bothCorrect.pairs, 0);
  assert.equal(out.report.rows[0].pass, null);
  assert.equal(out.report.comparison.pairs[0].baselineCorrect, null);
  assert.match(await readFile(join(out.output, 'comparison.md'), 'utf8'), /正确性未评分/);
});
test('absent WebMCP stops before any model runs, without presenting an on/off win', async t => {
  const { options } = await fixture(t), calls = [];
  const out = await runWebsiteAblation(options, { runAttempt: async args => { calls.push(args); return { webmcp: 'on', tools: [] }; } });
  assert.equal(out.exitCode, 2); assert.equal(out.report.status, 'not-applicable');
  assert.equal(calls.length, 1); assert.equal(calls[0].inspect, true);
  assert.equal(out.report.rows.length, 0); assert.equal(out.report.comparison, undefined);
});
test('script is frozen and sent only to on; expected answer is not leaked into the prompt', async t => {
  const { dir, options } = await fixture(t), calls = [];
  const script = join(dir, 'tool.js'); await writeFile(script, '/* original */');
  const out = await runWebsiteAblation({ ...options, n: '1', 'webmcp-file': script, 'expected-answer': 'Aurora' }, { runAttempt: async args => { calls.push(args); await writeFile(script, '/* changed */'); return result(args); } });
  assert.equal(out.report.comparison.bothCorrect.pairs, 1);
  for (const args of calls) { assert.equal(args.webmcpSource, args.webmcp === 'on' ? '/* original */' : undefined); assert.equal(args.prompt, options.query); }
});
test('failed, interrupted or contaminated attempts cannot establish an efficiency gain', async t => {
  const { options } = await fixture(t);
  const out = await runWebsiteAblation({ ...options, n: '1' }, { runAttempt: async args => args.inspect ? result(args) : { ...result(args), webmcp: 'on' } });
  assert.equal(out.exitCode, 1); assert.equal(out.report.comparison.allComparable.pairs, 0);
});
test('validates query/URL/budgets and optional oracle', () => {
  const v = { url: 'https://example.com', query: 'Read', n: '1' };
  for (const patch of [{ url: 'file:///etc/passwd' }, { url: 'https://u:p@example.com' }, { query: '' }, { n: '0' }, { 'timeout-seconds': '601' }, { 'expected-answer': '' }, { webmcp: 'off' }, { 'task-file': 'tasks.yaml' }]) assert.throws(() => validateAblationOptions({ ...v, ...patch }));
  assert.equal(scoreAblationAnswer('Final answer: ＡＵＲＯＲＡ', 'aurora').pass, true);
  assert.equal(scoreAblationAnswer('wrong', 'Aurora').pass, false);
  assert.equal(scoreAblationAnswer('anything').pass, null);
});

test('counts both historical WebMCP dispatch and directly registered tools in diagnostics', async t => {
  const { options } = await fixture(t);
  const out = await runWebsiteAblation({ ...options, n: '1' }, { runAttempt: async args => {
    const value = result(args);
    if (!args.inspect && args.webmcp === 'on') value.transcript = [
      { type: 'tool/call', data: { name: 'browser_webmcp_call' } },
      { type: 'tool/call', data: { name: 'webmcp__query_order__binding_1' } },
      { type: 'tool/call', data: { name: 'webmcp_read_source' } },
      { type: 'tool/call', data: { name: 'browser_context' } },
    ];
    return value;
  } });
  assert.equal(out.report.rows.find(row => row.arm === 'on').diagnostics.webmcpCalls, 2);
  assert.equal(out.report.rows.find(row => row.arm === 'off').diagnostics.webmcpCalls, 0);
});
