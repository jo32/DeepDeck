import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, copyFile, chmod, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Each attempt owns a fresh Electron storage partition, Harness and workspace. */
export async function runDesktopAttempt({ url, prompt, maxSteps, inspect = false, allowMissingTools = false, webmcpSource, webmcp = "on", today, provider, model, reasoningEffort, settingsFrom, logFile, signal, timeoutMs = 600_000 }) {
  const profile = await mkdtemp(join(tmpdir(), 'deepdeck-webmcp-bench-'));
  const readyFile = join(profile, 'controller.json');
  const token = randomBytes(32).toString('hex');
  let child, log, exited = false, shellUrl, versions;
  try {
    const dsh = join(profile, 'dsh');
    await mkdir(dsh);
    await mkdir(join(profile, 'workspace'));
    // Copy configuration only. No sessions, user browser storage or project files.
    if (!inspect && settingsFrom) {
      for (const name of ['settings.yaml', '.credentials.yaml', '.openai-codex-auth.json']) {
        try { await copyFile(join(settingsFrom, name), join(dsh, name)); await chmod(join(dsh, name), 0o600); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    log = await open(logFile, 'wx', 0o600);
    const env = { ...process.env, DSH_HOME: dsh, DEEPDECK_BROWSER_HOME: join(profile, 'browser'),
      DEEPDECK_BENCHMARK_ROOT: root, DEEPDECK_BENCHMARK_PROFILE: profile,
      DEEPDECK_BENCHMARK_WEBMCP: webmcp, DEEPDECK_BENCHMARK_READY: readyFile, DEEPDECK_BENCHMARK_TOKEN: token,
      DEEPSEEK_DESKTOP_NODE_BINARY: process.execPath, DEEPSEEK_DESKTOP_WORKSPACE: join(profile, 'workspace'),
      DEEPSEEK_HARNESS_PATH: join(root, 'vendor/deepseek-harness'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(electron, [fileURLToPath(new URL('./benchmark-desktop.cjs', import.meta.url))], { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', log.fd, log.fd, 'ipc'] });
    let spawnError;
    child.once('error', error => { spawnError = error; });
    child.once('exit', () => { exited = true; });
    child.on('message', message => { if (message.type === 'benchmark-shell') { shellUrl = message.url; versions = message.versions; } });
    const startupDeadline = Date.now() + 120_000;
    let control;
    while (!control || !shellUrl) {
      signal?.throwIfAborted();
      if (spawnError) throw spawnError;
      if (exited) throw new Error(`DeepDeck exited during startup. See ${logFile}`);
      if (Date.now() > startupDeadline) throw new Error(`DeepDeck startup timed out. See ${logFile}`);
      try { control = JSON.parse(await readFile(readyFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      await delay(200);
    }
    const call = async (path, body) => {
      const response = await fetch(control.url + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Controller HTTP ${response.status}`);
      return data;
    };
    await call('/run', { webmcp, webmcpSource, allowMissingTools, today, url, shellUrl, prompt, maxSteps, timeoutMs, inspect, provider, model, reasoningEffort });
    const deadline = Date.now() + timeoutMs + 120_000;
    let phase;
    while (true) {
      signal?.throwIfAborted();
      if (exited) throw new Error(`DeepDeck exited during attempt. See ${logFile}`);
      const state = await call('/status');
      if (state.phase && state.phase !== phase) { phase = state.phase; console.log(`DeepDeck: ${phase}`); }
      if (state.status === 'completed') return { ...state.result, desktopVersions: versions };
      if (state.status === 'failed') throw new Error(state.error);
      if (Date.now() > deadline) throw new Error('DeepDeck attempt exceeded outer deadline.');
      await delay(500);
    }
  } finally {
    if (child && !exited && child.pid) {
      try { child.send({ type: 'benchmark-stop' }); } catch {}
      for (let i = 0; i < 50 && !exited; i++) await delay(100);
      const kill = signal => { try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
      if (!exited) { kill('SIGTERM'); for (let i = 0; i < 30 && !exited; i++) await delay(100); }
      if (!exited) kill('SIGKILL');
      for (let i = 0; i < 30 && !exited; i++) await delay(100);
      if (!exited) throw new Error(`Cannot prove desktop process ${child.pid} stopped; retained isolated profile ${profile}`);
    }
    await log?.close();
    await rm(profile, { recursive: true, force: true });
  }
}
