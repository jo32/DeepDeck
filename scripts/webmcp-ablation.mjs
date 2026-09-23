import { timeBudget } from '../benchmarks/webmcp/harness/tasks.mjs';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, chmod, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { configureBenchmarkModel, validateModelOptions } from './webmcp-model-config.mjs';
import { armOrder, compareRows } from './webmcp-comparison.mjs';

export const ablationOptions = Object.fromEntries(['url', 'query', 'expected-answer', 'webmcp-file'].map(name => [name, { type: 'string' }]));
export function validateAblationOptions(v) {
  let url;
  try { url = new URL(v.url); } catch { throw new Error('ablate requires --url with an HTTP(S) website.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('--url must be HTTP(S) without embedded credentials.');
  if (!v.query?.trim()) throw new Error('ablate requires --query.');
  if (Buffer.byteLength(v.query) > 32 * 1024) throw new Error('--query must be at most 32 KiB.');
  if (v['expected-answer'] !== undefined && !v['expected-answer'].trim()) throw new Error('--expected-answer cannot be empty.');
  if (!Number.isInteger(Number(v.n ?? 3)) || Number(v.n ?? 3) < 1 || Number(v.n ?? 3) > 20) throw new Error('--n must be 1–20.');
  timeBudget({}, v['timeout-seconds']);
  if (v.webmcp && v.webmcp !== 'compare') throw new Error('ablate always compares WebMCP on/off; omit --webmcp or use compare.');
  if (v['task-file'] || v['task-ids'] || v.port || (v.sites && v.sites !== 'lite')) throw new Error('ablate uses --url and --query, not corpus tasks or managed containers.');
  if (Boolean(v.provider) !== Boolean(v.model)) throw new Error('Specify both --provider and --model.');
  validateModelOptions(v);
  return { url: url.href, n: Number(v.n ?? 3), timeoutMs: timeBudget({}, v['timeout-seconds']) };
}
export function scoreAblationAnswer(answer, expected) {
  if (expected === undefined) return { pass: null, detail: 'Unscored: no independent expected answer supplied.' };
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return { pass: normalize(answer).includes(normalize(expected)), detail: 'Case-insensitive normalized substring check; not a semantic correctness judge.' };
}
export function toolDiagnostics(result) {
  const events = result?.transcript ?? [];
  return {
    webmcpCalls: events.filter(event => event.type === 'tool/call' && (event.data.name === 'browser_webmcp_call' || event.data.name?.startsWith('webmcp__'))).length,
    toolErrors: events.filter(event => event.type === 'tool/result' && event.data.message?.content?.some(part => part.isError)).length,
  };
}
const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
export function ablationMarkdown(report) {
  const lines = ['# 网站 WebMCP 消融实验', '', `网站：${report.url}`, '', 'Query：', '', '```text', report.query.replaceAll('```', "'''"), '```', '', `状态：${report.status}`, '',
    '两组使用相同模型、query 和Agent 时间上限，每次启动全新浏览器与会话，按轮交替执行顺序。线上网站的后端状态没有重置，内容变化、缓存与服务负载可能影响结果。', '',
    report.expectedAnswer === undefined ? '未提供标准答案：正确性未评分。有 WebMCP 的答案仅作为参照，不能因此认定正确，也不能仅凭速度判断使用效果更好。' : '正确性采用预期答案的文本包含匹配；这不等同于完整的语义质量评价。', ''];
  if (report.reason) lines.push(report.reason, '');
  if (report.comparison) {
    const c = report.comparison;
    lines.push('| 轮次 | 正确 on / off | Token on / off（含缓存） | Agent 秒 on / off |', '|---|---|---|---|');
    for (const p of c.pairs) lines.push(`| ${p.repeat + 1} | ${p.correctness.on ?? '未评分'} / ${p.correctness.off ?? '未评分'} | ${fmt(p.metrics.on.totalTokens)} / ${fmt(p.metrics.off.totalTokens)} | ${fmt(p.metrics.on.agentMs === null ? null : p.metrics.on.agentMs / 1000)} / ${fmt(p.metrics.off.agentMs === null ? null : p.metrics.off.agentMs / 1000)} |`);
    const aggregate = report.expectedAnswer === undefined ? c.allComparable : c.bothCorrect;
    lines.push('', `汇总：${aggregate.pairs} 对${report.expectedAnswer === undefined ? '完整执行的配对（正确性未验证）' : '两侧都通过答案校验的配对'}。`, '', '以下正数表示有 WebMCP 节省，负数表示增加：');
    for (const [key, label] of [['totalTokens', 'Token'], ['agentMs', 'Agent 耗时']]) lines.push(`- ${label}：${fmt(aggregate.metrics[key].totals?.webmcpReductionPercent)}%；有效样本 ${aggregate.metrics[key].measuredPairs}。`);
    lines.push('', 'Agent 耗时不含浏览器启动；token 总量不是账单金额。少量重复只能作为描述性结果。', '', '## 两组答案与工具使用');
    for (const row of report.rows) lines.push('', `### 第 ${row.repeat + 1} 轮 · WebMCP ${row.arm}`, '', `WebMCP 调用：${row.diagnostics?.webmcpCalls ?? 0}；工具错误：${row.diagnostics?.toolErrors ?? 0}。`, '', '```text', (row.error ?? row.result?.failure ?? '').replaceAll('```', "'''"), (row.result?.finalText ?? '').replaceAll('```', "'''"), '```');
    if (!report.rows.some(row => row.arm === 'on' && row.diagnostics?.webmcpCalls > 0)) lines.push('', '有 WebMCP 组没有调用 WebMCP 工具：测得的是提供工具的影响，不能据此判断工具执行的收益。');
  }
  return lines.join('\n') + '\n';
}

/** External-site runner: no corpus or Docker; remote backend state is not reset. */
export async function runWebsiteAblation(v, { runAttempt, outputRoot = resolve('.deepdeck/benchmarks') } = {}) {
  const { url, n, timeoutMs } = validateAblationOptions(v);
  let source;
  if (v['webmcp-file']) {
    source = await readFile(resolve(v['webmcp-file']), 'utf8');
    if (!source.trim() || Buffer.byteLength(source) > 256 * 1024) throw new Error('--webmcp-file must contain a script of 1–262144 bytes.');
  }
  runAttempt ??= (await import('../apps/desktop/scripts/webmcp-benchmark-desktop.mjs')).runDesktopAttempt;
  const output = resolve(v.output ?? join(outputRoot, `website-${new Date().toISOString().replaceAll(':', '-')}`));
  await mkdir(output, { recursive: true });
  const reportFile = join(output, 'report.json');
  if (existsSync(reportFile)) throw new Error(`Refusing to overwrite ${reportFile}`);
  const snapshot = await mkdtemp(join(tmpdir(), 'deepdeck-ablation-settings-'));
  const controller = new AbortController();
  const stop = () => { if (!controller.signal.aborted) console.log('Stopping website experiment and closing the isolated browser…'); controller.abort(new Error('Experiment interrupted')); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const task = { site: new URL(url).origin, id: 'website-query' };
  const report = { formatVersion: 2, kind: 'deepdeck-website-ablation', startedAt: new Date().toISOString(), url, query: v.query, expectedAnswer: v['expected-answer'], status: 'starting', rows: [], preflight: {},
    provenance: { n, timeoutMs, provider: v.provider ?? 'configured-default', model: v.model ?? 'configured-default', effort: v.effort ?? 'provider-default', webmcpSource: source ? 'provided-script' : 'site-native', scriptSha256: source ? createHash('sha256').update(source).digest('hex') : null, isolation: 'Fresh desktop, session and browser storage for every arm; no remote backend reset; identical frozen settings and query.' } };
  const save = async () => { await writeFile(reportFile + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); await rename(reportFile + '.tmp', reportFile); };
  try {
    const settingsFrom = resolve(v['settings-from'] ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
    for (const name of ['settings.yaml', '.credentials.yaml', '.openai-codex-auth.json']) {
      try { await copyFile(join(settingsFrom, name), join(snapshot, name)); await chmod(join(snapshot, name), 0o600); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const model = await configureBenchmarkModel(snapshot, v);
    Object.assign(report.provenance, model);
    const attempt = (arm, name, inspect = false) => runAttempt({ url, prompt: v.query, timeoutMs, webmcp: arm, ...(arm === 'on' && source ? { webmcpSource: source } : {}), inspect, allowMissingTools: inspect, today: report.startedAt.slice(0, 10), provider: model.provider, model: model.model, reasoningEffort: v.effort, settingsFrom: snapshot, logFile: join(output, `${name}.desktop.log`), signal: controller.signal });
    report.status = 'checking-webmcp'; await save();
    console.log(`Checking WebMCP: ${url}`);
    for (const arm of ['on', 'off']) {
      controller.signal.throwIfAborted();
      report.preflight[arm] = await attempt(arm, `preflight-${arm}`, true);
      if (report.preflight[arm].webmcp !== arm) throw new Error('Preflight WebMCP mode mismatch.');
      await save();
      if (arm === 'on' && !report.preflight.on.tools?.length) {
        report.status = 'not-applicable'; report.reason = 'No native WebMCP tools discovered within 10 seconds after page load. Provide --webmcp-file for a local implementation, or choose a page that exposes tools without login. No model runs were made.';
        return { report, output, exitCode: 2 };
      }
      if (arm === 'off' && report.preflight.off.tools?.length) throw new Error('Off preflight exposed WebMCP tools.');
    }
    report.status = 'running';
    for (let repeat = 0; repeat < n; repeat++) for (const arm of armOrder('compare', repeat)) {
      controller.signal.throwIfAborted();
      console.log(`Website query ${repeat + 1}/${n} [WebMCP ${arm}]`);
      const row = { site: task.site, taskId: task.id, repeat, arm, timeoutMs, pass: null };
      const started = performance.now();
      try {
        row.result = await attempt(arm, `query-${repeat + 1}-${arm}`);
        if (row.result.webmcp !== arm || (arm === 'on' && !row.result.initialTools?.length) || (arm === 'off' && row.result.initialTools?.length)) throw new Error('Attempt has an invalid WebMCP treatment.');
        row.verdict = row.result.failure ? { pass: false, detail: row.result.failure } : scoreAblationAnswer(row.result.finalText, v['expected-answer']);
        row.pass = row.verdict.pass;
        row.diagnostics = toolDiagnostics(row.result);
      } catch (error) { row.error = String(error); }
      row.wallMs = performance.now() - started;
      report.rows.push(row); await save();
      console.log(`${row.error || row.result?.failure ? 'ERROR' : row.pass === null ? 'DONE (unscored)' : row.pass ? 'PASS' : 'FAIL'} [${arm}]`);
    }
    report.status = report.rows.some(row => row.error || row.result?.failure) ? 'failed' : 'completed';
  } catch (error) {
    report.status = controller.signal.aborted ? 'interrupted' : 'failed'; report.reason = String(error);
  } finally {
    await rm(snapshot, { recursive: true, force: true });
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    report.finishedAt = new Date().toISOString();
    if (report.rows.length) report.comparison = compareRows(report.rows, [task], n);
    await save();
    await writeFile(join(output, 'comparison.md'), ablationMarkdown(report), { mode: 0o600 });
    if (report.reason) console.log(report.reason);
    if (report.comparison) {
      const aggregate = report.expectedAnswer === undefined ? report.comparison.allComparable : report.comparison.bothCorrect;
      console.log(`Comparable pairs: ${aggregate.pairs}; correctness ${report.expectedAnswer === undefined ? 'unscored' : 'checked by expected-answer substring'}.`);
      console.log(`WebMCP savings: tokens ${fmt(aggregate.metrics.totalTokens.totals?.webmcpReductionPercent)}%; agent time ${fmt(aggregate.metrics.agentMs.totals?.webmcpReductionPercent)}%.`);
    }
    console.log(`Comparison: ${join(output, 'comparison.md')}\nReport: ${reportFile}`);
  }
  return { report, output, exitCode: report.status === 'completed' && !report.rows.some(row => row.pass === false) ? 0 : 1 };
}
