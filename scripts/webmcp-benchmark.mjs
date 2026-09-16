import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, rename, mkdtemp, copyFile, chmod, rm } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ablationOptions, runWebsiteAblation } from './webmcp-ablation.mjs';
import { modelOptions, validateModelOptions, configureBenchmarkModel } from './webmcp-model-config.mjs';
import { armOrder, compareRows, comparisonMarkdown } from './webmcp-comparison.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const corpus = join(root, 'benchmarks/webmcp');
export function corpusDigest(directory = corpus) {
  const hash = createHash('sha256');
  const visit = relative => {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) hash.update(path).update('\0').update(readFileSync(join(directory, path))).update('\0');
    }
  };
  for (const name of ['tasks', 'sites', 'goldens', 'fixtures', 'capsules', 'scoring', 'harness']) visit(name);
  return hash.digest('hex');
}
export function capsuleEnvironment(environment = process.env) {
  const prefix = process.arch === 'arm64' ? '/opt/homebrew' : '/usr/local';
  return { ...environment, WT_WEBMCP: '1', PATH: [join(prefix, 'opt/bash/bin'), join(prefix, 'opt/coreutils/libexec/gnubin'), join(prefix, 'opt/gnu-tar/libexec/gnubin'), environment.PATH].filter(Boolean).join(delimiter),
    CAPSULE_RUNTIME_ROOT: environment.CAPSULE_RUNTIME_ROOT ?? join(tmpdir(), `deepdeck-webmcp-capsules-${process.getuid?.() ?? 'local'}`) };
}
function command(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, env: capsuleEnvironment(), stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
  });
}
// Let the capsule's locked reservation decide availability, including stopped runs.
export async function bootBenchmarkCapsule(boot, site, options, autoPort) {
  for (let port = options.port; port <= Math.min(65535, options.port + (autoPort ? 99 : 0)); port++) {
    options.signal?.throwIfAborted();
    try {
      return await boot(site, { ...options, port });
    } catch (error) {
      const conflict = error.stderr?.split('\n').some(line =>
        line.startsWith(`port ${port} is reserved by `) || line === `port is already occupied: ${port}`);
      if (!autoPort || !conflict) throw error;
    }
  }
  throw new Error(`No available benchmark port in ${options.port}–${Math.min(65535, options.port + 99)}; specify --port.`);
}
export function selectTasks(tasks, ids) {
  if (!ids) return tasks;
  const requested = ids.split(',');
  const missing = requested.filter(id => !tasks.some(task => task.id === id));
  if (missing.length) throw new Error(`Unknown or unselected tasks: ${missing.join(', ')}`);
  return tasks.filter(task => requested.includes(task.id));
}
export function summarize(rows, expectedRepeats) {
  const keys = [...new Set(rows.map(row => row.taskId))];
  const tasks = keys.map(taskId => {
    const attempts = rows.filter(row => row.taskId === taskId);
    const passes = attempts.filter(row => row.pass === true).length;
    return { taskId, attempts: attempts.length, expectedRepeats, passes, complete: attempts.length === expectedRepeats, solved: attempts.length === expectedRepeats && passes > expectedRepeats / 2 };
  });
  return { tasks, solved: tasks.filter(task => task.solved).length, failures: rows.filter(row => row.pass === false).length };
}
async function atomicJson(file, value) { await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await rename(file + '.tmp', file); }

export async function main(args = process.argv.slice(2)) {
  const { values: v, positionals } = parseArgs({ args, allowPositionals: true, options: {
    sites: { type: 'string', default: 'lite' }, 'task-ids': { type: 'string' }, 'task-file': { type: 'string' }, n: { type: 'string', default: '3' }, port: { type: 'string' },
    webmcp: { type: 'string' }, 'max-steps': { type: 'string' }, output: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' }, effort: { type: 'string' },
    ...modelOptions, ...ablationOptions, 'settings-from': { type: 'string' }, 'run-id': { type: 'string', default: 'deepdeck-local' }, help: { type: 'boolean' },
  } });
  const action = positionals[0] ?? 'help';
  if (v.help || action === 'help') {
    console.log('pnpm benchmark:webmcp <doctor|list|up|down|smoke|run|ablate> [--sites lite|core|full|site1,site2] [--task-file PATH] [--task-ids id1,id2] [--n 3] [--webmcp on|off|compare] [--max-steps 12] [--provider ID --model ID] [--base-url URL] [--api-key-env NAME | --api-key-file PATH | --api-key KEY] [--api PROTOCOL] [--settings-from ~/.dsh] [--output PATH]\nablate --url URL --query TEXT [--expected-answer TEXT] [--webmcp-file script.js]: compare any website without Docker.\nsmoke: discover native WebMCP tools in a fresh DeepDeck per selected site, without model calls.\nrun: local editable tasks and scoring, real DeepDeck Agent, fresh desktop per attempt.\nrun/smoke automatically start and stop their own websites; no up/down needed. Ctrl+C waits for safe cleanup.\nup/down: keep/stop local websites (stable --run-id and --port).'); return;
  }
  if (action === 'ablate') {
    const result = await runWebsiteAblation(v); process.exitCode = result.exitCode; return;
  }
  if (v.url || v.query || v['webmcp-file'] || v['expected-answer']) throw new Error('--url/--query/--webmcp-file/--expected-answer require ablate.');
  if (action === 'doctor') {
    for (const [file, argv] of [['docker', ['info', '--format', '{{.ServerVersion}}']], ['tar', ['--version']], ['realpath', ['--version']], ['jq', ['--version']], ['flock', ['--version']]]) await command(file, argv);
    await command('bash', ['-c', '(( BASH_VERSINFO[0] >= 4 )) || { echo "Bash 4+ required (macOS: brew install bash)" >&2; exit 1; }']);
    if (!existsSync(join(corpus, 'node_modules/js-yaml'))) throw new Error('Run pnpm install.');
    if (!existsSync(join(root, 'apps/desktop/dist/main/index.js'))) throw new Error('Run pnpm build:desktop.');
    console.log('Local prerequisites available.'); return;
  }
  if (!['list', 'up', 'down', 'smoke', 'run'].includes(action)) throw new Error(`Unknown command ${action}`);
  const { loadRegistry, resolveProfile } = await import(pathToFileURL(join(corpus, 'harness/sites.mjs')));
  const { loadTasks, loadTaskFile, resolveTask, startUrl, stepBudget } = await import(pathToFileURL(join(corpus, 'harness/tasks.mjs')));
  const registry = loadRegistry();
  const sites = registry.profiles[v.sites] ? resolveProfile(v.sites, registry) : v.sites.split(',');
  if (new Set(sites).size !== sites.length || sites.some(id => !registry.sites.some(site => site.id === id))) throw new Error('Unknown or duplicate site selection.');
  if (v['task-file'] && sites.length !== 1) throw new Error('--task-file requires exactly one --sites site ID.');
  const tasks = selectTasks(sites.flatMap(site => (v['task-file'] ? loadTaskFile(v['task-file']) : loadTasks(site)).map(task => ({ ...resolveTask(task), site }))), v['task-ids']);
  if (!tasks.length) throw new Error('No tasks selected.');
  validateTasks(tasks);
  if (action === 'list') { console.log(JSON.stringify({ sites, tasks: tasks.map(({ site, id, tier, prompt }) => ({ site, id, tier, prompt })) }, null, 2)); return; }
  const webmcp = v.webmcp ?? (action === 'run' ? 'compare' : 'on');
  const arms = armOrder(webmcp);
  if ((action === 'up' || action === 'down') && v.webmcp) throw new Error('--webmcp controls benchmark browsers; use it with run or smoke.');
  if (v['max-steps'] && (!Number.isInteger(Number(v['max-steps'])) || Number(v['max-steps']) < 1 || Number(v['max-steps']) > 100)) throw new Error('--max-steps must be 1–100.');
  const port = Number(v.port ?? 3215), n = action === 'smoke' ? 1 : Number(v.n);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('n must be 1–20.');
  if (!Number.isInteger(port) || port < 1024 || port + sites.length - 1 > 65535) throw new Error('Invalid port range.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(v['run-id'])) throw new Error('Invalid run-id.');
  validateModelOptions(v);
  if (Boolean(v.provider) !== Boolean(v.model)) throw new Error('Specify both provider and model.');
  const { bootCapsule } = await import(pathToFileURL(join(corpus, 'harness/capsule.mjs')));
  if (action === 'up' || action === 'down') {
    for (const [i, site] of sites.entries()) {
      const argv = [site, 'down', '--run-id', v['run-id'], '--port', String(port + i)];
      if (action === 'down') await command(join(corpus, 'harness/bin/capsule'), argv, { cwd: corpus });
      else { const capsule = await bootCapsule(site, { reuseExisting: true, port: port + i, runId: v['run-id'], env: capsuleEnvironment() }); console.log(`${site}: ${capsule.baseUrl}`); }
    }
    return;
  }
  // Never accept a fake lifecycle as a real DeepDeck result.
  if (process.env.WT_FAKE_LIFECYCLE || process.env.WT_MANUAL_BASEURL) throw new Error('Fake/manual lifecycle is disabled for DeepDeck benchmark runs.');
  const { score } = await import(pathToFileURL(join(corpus, 'scoring/predicates.mjs')));
  const { runDesktopAttempt } = await import('../apps/desktop/scripts/webmcp-benchmark-desktop.mjs');
  const output = resolve(v.output ?? join(root, '.deepdeck/benchmarks', new Date().toISOString().replaceAll(':', '-')));
  await mkdir(output, { recursive: true });
  const reportFile = join(output, 'report.json');
  if (existsSync(reportFile)) throw new Error(`Refusing to overwrite ${reportFile}`);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const report = { formatVersion: 2, kind: action === 'smoke' ? 'deepdeck-webmcp-discovery' : 'deepdeck-webmcp-agent', startedAt: new Date().toISOString(),
    provenance: { corpusSha256: corpusDigest(), taskSetSha256: createHash('sha256').update(JSON.stringify(tasks)).digest('hex'), deepdeck: git(root, 'rev-parse', 'HEAD'), deepdeckDirty: Boolean(git(root, 'status', '--porcelain', '--untracked-files=no')), provider: v.provider ?? 'configured-default', model: v.model ?? 'configured-default', effort: v.effort ?? 'provider-default', interface: 'DeepDeck default tools', toolPolicy: 'default-tools; native-WebMCP-disabled-in-off', seed: 1, n, webmcp, arms, maxSteps: v['max-steps'] ? Number(v['max-steps']) : 'task-webmcp-budget-shared-by-both-arms', sites, taskIds: tasks.map(task => task.id),
      isolation: 'One frozen settings snapshot per command. Identical patched site build; only native WebMCP browser feature differs. Fresh Electron profile and Harness home per attempt; capsule reset before each attempt.', cost: 'Unavailable; raw Harness token usage retained. Startup/reset excluded from agentMs.',
      comparison: 'DeepDeck-owned corpus and runner. Imported starting cases are credited in benchmarks/webmcp/NOTICE.md; local edits define this task set.' }, rows: [], errors: [] };
  const settingsSnapshot = await mkdtemp(join(tmpdir(), 'deepdeck-benchmark-settings-'));
  const controller = new AbortController();
  const runId = `${v['run-id']}-${process.pid}-${randomUUID().slice(0, 8)}`;
  report.instances = [];
  const stop = () => {
    if (!controller.signal.aborted) console.log('Stopping benchmark; waiting for the current lifecycle step, then cleaning up…');
    controller.abort(new Error('Benchmark interrupted'));
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    if (action === 'run') {
      const source = resolve(v['settings-from'] ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
      for (const name of ['settings.yaml', '.credentials.yaml', '.openai-codex-auth.json']) {
        try { await copyFile(join(source, name), join(settingsSnapshot, name)); await chmod(join(settingsSnapshot, name), 0o600); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const modelConfig = await configureBenchmarkModel(settingsSnapshot, v);
      if (modelConfig.provider) {
        v.provider = modelConfig.provider; v.model = modelConfig.model;
        Object.assign(report.provenance, modelConfig);
      }
    }
    await atomicJson(reportFile, report);
    for (const [i, site] of sites.entries()) {
      if (controller.signal.aborted) break;
      const selected = tasks.filter(task => task.site === site);
      if (!selected.length) continue;
      let capsule, instance;
      try {
        console.log(`Starting ${site} (first build may take several minutes)…`);
        capsule = await bootBenchmarkCapsule(bootCapsule, site, { port: port + i, runId, env: capsuleEnvironment(), signal: controller.signal }, v.port === undefined);
        instance = { site, runId, baseUrl: capsule.baseUrl, startedAt: new Date().toISOString() };
        report.instances.push(instance);
        await atomicJson(reportFile, report);
        console.log(`${site}: ${capsule.baseUrl} (managed automatically; stops when this run ends)`);
        for (const task of action === 'smoke' ? selected.slice(0, 1) : selected) {
          for (let repeat = 0; repeat < n && !controller.signal.aborted; repeat++) {
            for (const arm of armOrder(webmcp, repeat)) {
            if (controller.signal.aborted) break;
            console.log(`${action}: ${task.id} ${repeat + 1}/${n} [WebMCP ${arm}]`);
            const row = { site, taskId: task.id, repeat, arm, pass: false, maxSteps: v['max-steps'] ? Number(v['max-steps']) : stepBudget(task, 'webmcp', 12) };
            try {
              const resetStarted = performance.now(); await capsule.reset(); row.resetMs = performance.now() - resetStarted;
              const started = performance.now();
              row.result = await runDesktopAttempt({ url: startUrl(task, capsule), prompt: task.prompt, maxSteps: row.maxSteps, webmcp: arm, today: report.startedAt.slice(0, 10), inspect: action === 'smoke', provider: v.provider, model: v.model, reasoningEffort: v.effort,
                settingsFrom: settingsSnapshot, logFile: join(output, `${task.id}-${repeat}-${arm}.desktop.log`), signal: controller.signal });
              row.wallMs = performance.now() - started;
              row.verdict = action === 'smoke' ? { pass: arm === 'on' ? row.result.tools.length > 0 : row.result.tools.length === 0, detail: `Native WebMCP ${arm} and visible session checked; task not scored.` }
                : row.result.failure ? { pass: false, detail: row.result.failure } : await score(task.predicate, capsule, row.result.finalText);
              row.pass = row.verdict.pass;
            } catch (error) { row.error = String(error); }
            report.rows.push(row);
            await atomicJson(reportFile, report);
            console.log(`${row.pass ? 'PASS' : 'FAIL'} ${task.id} [${arm}]${row.error ? `: ${row.error}` : ''}`);
            }
          }
        }
      } catch (error) { report.errors.push({ site, error: String(error) }); console.error(`${site}: ${error}`); }
      finally {
        if (capsule) {
          console.log(`Stopping ${site}…`);
          try {
            await capsule.down();
            instance.stoppedAt = new Date().toISOString();
            console.log(`Stopped ${site}; instance and port released.`);
          } catch (error) {
            report.errors.push({ site, teardown: String(error) });
            console.error(`Could not clean up ${site}: ${error}\nRetry: pnpm benchmark:webmcp down --sites ${site} --run-id ${runId} --port ${new URL(capsule.baseUrl).port}`);
          }
        }
        await atomicJson(reportFile, report);
      }
    }
  } finally {
    await rm(settingsSnapshot, { recursive: true, force: true });
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    report.finishedAt = new Date().toISOString(); report.interrupted = controller.signal.aborted;
    report.summary = Object.fromEntries(arms.map(arm => [arm, action === 'smoke' ? { verified: report.rows.filter(row => row.arm === arm && row.pass).length, expected: new Set(tasks.map(task => task.site)).size } : summarize(report.rows.filter(row => row.arm === arm), n)]));
    if (webmcp === 'compare' && action === 'run') {
      report.comparison = compareRows(report.rows, tasks, n);
      await writeFile(join(output, 'comparison.md'), comparisonMarkdown(report));
      console.log(`Comparison: ${join(output, 'comparison.md')}`);
    }
    report.complete = !report.interrupted && !report.errors.length && report.rows.length === arms.length * (action === 'smoke' ? new Set(tasks.map(task => task.site)).size : tasks.length * n);
    await atomicJson(reportFile, report); console.log(`Report: ${reportFile}`);
  }
  if (!report.complete || report.rows.some(row => !row.pass)) process.exitCode = 1;
}

export function validateTasks(tasks) {
  const seen = new Set();
  for (const task of tasks) {
    if (typeof task.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(task.id)) throw new Error('Task IDs must be safe identifiers, without paths.');
    if (seen.has(task.id)) throw new Error(`Duplicate task ID: ${task.id}`);
    seen.add(task.id);
    if (typeof task.prompt !== 'string' || !task.prompt.trim()) throw new Error(`Missing prompt: ${task.id}`);
    if (!task.predicate || typeof task.predicate !== 'object') throw new Error(`Missing predicate: ${task.id}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
