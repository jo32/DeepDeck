import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkBrowserUse } from './browser-use-benchmark.mjs';

const content = text => ({ content: [{ type: 'text', text }] });
function fixture({ failMutation = false, failOracle = false } = {}) {
  let resets = 0, fills = 0;
  return {
    reset: async () => { resets++; return 1; },
    invoke: async (name, args) => {
      if (name === 'mcp__chrome_devtools__batch') {
        fills++;
        return { status: failMutation ? 'stopped' : 'completed', verification: { postcondition: 'not_checked' },
          ...content('Results for: 中文搜索 WebMCP') };
      }
      if (args.name === 'fill') {
        fills++;
        if (failMutation) throw new Error('Outcome unknown');
      }
      if (args.name === 'evaluate_script') {
        if (failOracle) throw new Error('Duplicate submission: searches=2');
        return content('{"verified":true}');
      }
      return content('uid=1_1 searchbox "Search"\nResults for: 中文搜索 WebMCP');
    },
    counts: () => ({ resets, fills }),
  };
}

test('separates warmups and verification from actions and records one mutation attempt per sample', async () => {
  const f = fixture();
  const report = await benchmarkBrowserUse({ ...f, repeats: 2 });
  assert.equal(report.warmups.length, 3);
  assert.equal(report.samples.length, 6);
  assert.deepEqual(report.summaries.map(s => s.toolCallsMedian), [3, 1, 1]);
  assert(report.summaries.every(s => s.runs === 2 && s.successRate === 1));
  assert.deepEqual(f.counts(), { resets: 9, fills: 9 });
  assert.equal(report.modelLatencyMs, null);
  assert.equal(report.modelTokens, null);
});

for (const failure of ['failMutation', 'failOracle']) test(`${failure} cannot appear as a faster successful sample or trigger a retry`, async () => {
  const f = fixture({ [failure]: true });
  const report = await benchmarkBrowserUse({ ...f, repeats: 1 });
  assert(report.samples.every(s => !s.success && s.error));
  assert(report.summaries.every(s => s.failures === 1 && s.successfulActionMedianMs === null));
  assert.deepEqual(f.counts(), { resets: 6, fills: 6 });
});
