import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { bootBenchmarkCapsule, capsuleEnvironment, selectTasks, summarize, corpus, corpusDigest, validateTasks, root } from './webmcp-benchmark.mjs';

test('task selection rejects silent typos and preserves source order', () => {
  const tasks = [{ id: 'one' }, { id: 'two' }];
  assert.deepEqual(selectTasks(tasks, 'two,one'), tasks);
  assert.throws(() => selectTasks(tasks, 'missing'), /Unknown/);
});
test('a partial or interrupted majority is never reported solved', () => {
  assert.equal(summarize([{ taskId: 'a', pass: true }, { taskId: 'a', pass: true }], 3).solved, 0);
  assert.equal(summarize([{ taskId: 'a', pass: true }, { taskId: 'a', pass: false }, { taskId: 'a', pass: true }], 3).solved, 1);
  assert.equal(summarize([{ taskId: 'a', pass: true }, { taskId: 'a', pass: false }], 2).solved, 0);
});
test('capsule runtime lives outside the source repository and honors explicit roots', () => {
  assert.equal(capsuleEnvironment({ WT_WEBMCP: '0' }).WT_WEBMCP, '1', 'golden patch installation must be enabled explicitly');
  assert(!capsuleEnvironment({ PATH: '/bin' }).CAPSULE_RUNTIME_ROOT.startsWith(corpus));
  assert.equal(capsuleEnvironment({ CAPSULE_RUNTIME_ROOT: '/tmp/custom' }).CAPSULE_RUNTIME_ROOT, '/tmp/custom');
});
test('local starter corpus supplies all eight original task sets and golden patches', () => {
  const sites = ['tailwind-nextjs-blog', 'bulletproof-react', 'directory-9d8', 'nextjs-starter-medusa', 'easyappointments', 'learnhouse', 'idurar-erp-crm', 'hi-events'];
  for (const site of sites) {
    assert(existsSync(join(corpus, 'tasks', `${site}.yaml`)));
    assert(existsSync(join(corpus, 'goldens', `${site}.reference.patch`)));
    assert(existsSync(join(corpus, 'capsules', site, 'capsule.yaml')));
  }
  assert.match(readFileSync(join(corpus, 'LICENSE'), 'utf8'), /Apache License/);
});

test('custom task file replaces starter tasks and is not limited to 49 tasks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deepdeck-custom-tasks-'));
  try {
    const file = join(directory, 'custom.yaml');
    writeFileSync(file, JSON.stringify({ tasks: Array.from({ length: 55 }, (_, i) => ({ id: `custom-${i}`, tier: 'answer', prompt: `Question ${i}`, predicate: { type: 'answer', contains: ['example'] } })) }));
    const result = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/webmcp-benchmark.mjs'), 'list', '--sites', 'tailwind-nextjs-blog', '--task-file', file], { encoding: 'utf8' }));
    assert.equal(result.tasks.length, 55);
    assert(result.tasks.every(task => task.id.startsWith('custom-')));
    assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/webmcp-benchmark.mjs'), 'list', '--task-file', file], { stdio: 'pipe' }), /requires exactly one/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('task IDs cannot overwrite report paths or collide', () => {
  const task = { id: 'custom', prompt: 'Question', predicate: { type: 'answer', contains: ['answer'] } };
  assert.throws(() => validateTasks([{ ...task, id: '../report' }]), /safe identifiers/);
  assert.throws(() => validateTasks([task, task]), /Duplicate/);
});
test('editing local tool code changes corpus provenance', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deepdeck-corpus-hash-'));
  try {
    for (const name of ['tasks', 'sites', 'goldens', 'fixtures', 'capsules', 'scoring', 'harness']) mkdirSync(join(directory, name));
    const file = join(directory, 'goldens/tool.patch');
    writeFileSync(file, 'version one');
    const before = corpusDigest(directory);
    writeFileSync(file, 'version two');
    assert.notEqual(corpusDigest(directory), before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('automatic benchmark ports skip reservations and listeners; explicit ports and unrelated failures are preserved', async () => {
  const ports = [];
  const boot = async (site, options) => {
    ports.push(options.port);
    if (options.port < 3217) throw Object.assign(new Error('prepare failed'), { stderr: options.port === 3215 ? 'port 3215 is reserved by blog/manual\n' : 'port is already occupied: 3216\n' });
    return { baseUrl: `http://127.0.0.1:${options.port}` };
  };
  assert.equal((await bootBenchmarkCapsule(boot, 'blog', { port: 3215 }, true)).baseUrl, 'http://127.0.0.1:3217');
  assert.deepEqual(ports, [3215, 3216, 3217]);
  ports.length = 0;
  await assert.rejects(bootBenchmarkCapsule(boot, 'blog', { port: 3215 }, false), /prepare failed/);
  assert.deepEqual(ports, [3215]);
  let attempts = 0;
  await assert.rejects(bootBenchmarkCapsule(async () => { attempts++; throw new Error('build failed'); }, 'blog', { port: 3215 }, true), /build failed/);
  assert.equal(attempts, 1);
  await assert.rejects(bootBenchmarkCapsule(async (_, { port }) => { throw Object.assign(new Error('busy'), { stderr: `port is already occupied: ${port}` }); }, 'blog', { port: 65535 }, true), /No available benchmark port/);
});
