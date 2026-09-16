import test from 'node:test';
import assert from 'node:assert/strict';
import { armOrder, compareRows, metrics, delta } from './webmcp-comparison.mjs';
const task = { site: 'blog', id: 'author' };
const row = (arm, patch = {}) => ({ site: 'blog', taskId: 'author', repeat: 0, arm, pass: true, result: { finalText: 'Author', usageComplete: true, usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 4, cache_creation_tokens: 1 }, agentMs: arm === 'on' ? 100 : 200, toolCalls: 2, stopReason: { kind: 'completed' }, routes: [{ provider: 'p', model: 'm' }] }, ...patch });
test('paired schedules alternate and do not mix arms when aggregating', () => {
 assert.deepEqual(armOrder('compare',0), ['on','off']); assert.deepEqual(armOrder('compare',1), ['off','on']);
 assert.deepEqual(armOrder('off'),['off']); assert.throws(()=>armOrder('typo'));
 const c=compareRows([row('off'),row('on')],[task],1);
 assert.equal(c.bothCorrect.pairs,1); assert.equal(c.pairs[0].deltas.agentMs.offMinusOn,100);
 assert.equal(c.pairs[0].deltas.agentMs.webmcpReductionPercent,50);
 assert.equal(c.pairs[0].metrics.on.totalTokens,17);
});
test('missing usage, partial pairs, failed baseline and route differences cannot claim wins',()=>{
 assert.equal(metrics(row('on',{result:{usageComplete:false}})).totalTokens,null);
 assert.equal(delta(0,0).offOverOn,null);
 assert.equal(compareRows([row('on')],[task],1).pairs[0].deltas.agentMs,null);
 const wrong=compareRows([row('on',{pass:false}),row('off')],[task],1);
 assert.equal(wrong.bothCorrect.pairs,0); assert.match(wrong.pairs[0].note,/not pass/);
 const unknown=row('off');unknown.result.routes=[{}];
 assert.equal(compareRows([row('on'),unknown],[task],1).allComparable.pairs,0);
 const other=row('off');other.result.routes[0].model='other';
 assert.equal(compareRows([row('on'),other],[task],1).pairs[0].deltas.agentMs,null);
 const duplicate=compareRows([row('on'),row('on'),row('off')],[task],1);
 assert.equal(duplicate.completedPairs,0);
 const failed=row('off');failed.result.failure='timeout';
 assert.equal(compareRows([row('on'),failed],[task],1).allComparable.pairs,0);
});
