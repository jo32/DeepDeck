import assert from 'node:assert/strict';

const variants = ['separate', 'batch', 'batch_with_snapshot'];
const text = result => result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
};

/** Deterministic tool-chain comparison, not an LLM or Figma benchmark. */
export async function benchmarkBrowserUse({ invoke, reset, repeats = 5 }) {
  assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 50, 'repeats must be 1–50');
  const samples = [];
  async function sample(variant, round, warmup) {
    const setupStarted = performance.now();
    const pageId = await reset();
    const mcp = (name, args) => invoke('mcp__chrome_devtools__call_tool', { name, arguments: args });
    const before = text(await mcp('take_snapshot', { pageId }));
    const uid = before.match(/uid=(\S+) (?:searchbox|textbox) "Search"/)?.[1];
    assert(uid, 'Search field must be observed before acting');
    const setupMs = performance.now() - setupStarted;
    const query = '中文搜索 WebMCP';
    const steps = [
      { name: 'fill', arguments: { pageId, uid, value: query } },
      { name: 'press_key', arguments: { pageId, key: 'Enter', ...(variant === 'batch_with_snapshot' ? { includeSnapshot: true } : {}) } },
      ...(variant === 'batch_with_snapshot' ? [] : [{ name: 'take_snapshot', arguments: { pageId } }]),
    ];
    let toolCalls = 0, responseBytes = 0, batchTiming, error, verified = false, verificationMs = 0;
    const started = performance.now();
    let actionMs;
    try {
      let observation;
      if (variant === 'separate') {
        for (const step of steps) {
          toolCalls++;
          observation = await mcp(step.name, step.arguments);
          responseBytes += Buffer.byteLength(JSON.stringify(observation));
          assert(!observation.isError, text(observation));
        }
      } else {
        toolCalls++;
        observation = await invoke('mcp__chrome_devtools__batch', { steps });
        responseBytes = Buffer.byteLength(JSON.stringify(observation));
        batchTiming = observation.timing;
        assert.equal(observation.status, 'completed', text(observation));
        assert.equal(observation.verification.postcondition, 'not_checked');
      }
      actionMs = performance.now() - started;
      assert.match(text(observation), /Results for: 中文搜索 WebMCP/, 'action response must contain updated state');
    } catch (caught) {
      actionMs ??= performance.now() - started;
      error = String(caught);
    }
    // Same independent oracle for all variants; outside the timed action path.
    // Never retry a failed mutation. A successful oracle cannot erase that failure.
    const verificationStarted = performance.now();
    try {
      const result = await mcp('evaluate_script', { pageId, function: `() => {
        const actual = { query: document.getElementById('query').value,
          result: document.getElementById('results').textContent,
          searches: Number(document.body.dataset.searches), posts: Number(document.body.dataset.posts) };
        if (actual.query !== ${JSON.stringify(query)} || actual.result !== ${JSON.stringify('Results for: ' + query)} || actual.searches !== 1 || actual.posts !== 0) throw new Error(JSON.stringify(actual));
        return { verified: true, ...actual };
      }` });
      assert(!result.isError, text(result));
      assert.match(text(result), /"verified"\s*:\s*true/);
      verified = true;
    } catch (caught) { error = [error, `Verification: ${String(caught)}`].filter(Boolean).join('\n'); }
    verificationMs = performance.now() - verificationStarted;
    return { variant, round, warmup, success: !error && verified, verified, toolCalls,
      plannedMcpCalls: steps.length, responseBytes, setupMs, actionMs, verificationMs,
      ...(batchTiming ? { batchTiming } : {}), ...(error ? { error } : {}) };
  }
  const warmups = [];
  for (const variant of variants) warmups.push(await sample(variant, -1, true));
  for (let round = 0; round < repeats; round++) {
    for (const variant of round % 2 ? [...variants].reverse() : variants) samples.push(await sample(variant, round, false));
  }
  return {
    formatVersion: 1, generatedAt: new Date().toISOString(), kind: 'browser-tool-chain',
    task: 'Fill a known Search field, submit once, return updated accessibility state',
    model: null, modelLatencyMs: null, modelTokens: null,
    measurement: {
      actionMs: 'Host tool execution through action response serialization; includes MCP waiting and returned observation.',
      excluded: ['Model generation and orchestration between calls', 'Browser startup, schema discovery and per-sample setup', 'Independent correctness oracle'],
      setup: 'Fresh navigation and an observed Search UID before every sample; same fixture, query and verification for every variant.',
      ordering: 'One excluded warmup per variant, then alternating forward/reverse order.',
      verification: 'Actual query and result, exactly one search submission, zero post submissions. Visual appearance and persistence are not tested.',
    },
    summaries: variants.map(variant => {
      const runs = samples.filter(sample => sample.variant === variant);
      const passed = runs.filter(sample => sample.success);
      return { variant, runs: runs.length, successes: passed.length, failures: runs.length - passed.length,
        successRate: passed.length / runs.length,
        successfulActionMedianMs: quantile(passed.map(sample => sample.actionMs), 0.5),
        successfulActionP95Ms: quantile(passed.map(sample => sample.actionMs), 0.95),
        toolCallsMedian: quantile(runs.map(sample => sample.toolCalls), 0.5),
        responseBytesMedian: quantile(runs.map(sample => sample.responseBytes), 0.5),
      };
    }), warmups, samples,
  };
}
