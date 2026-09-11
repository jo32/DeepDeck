import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'deepdeck-harness-ui-'));
const env = { ...process.env, DSH_HOME: join(profile, 'dsh'), DEEPDECK_BROWSER_HOME: join(profile, 'browser'),
  DEEPDECK_UI_TEST_ROOT: root, DEEPDECK_UI_TEST_PROFILE: profile,
  DEEPDECK_UI_TEST_SCREENSHOT: join(tmpdir(), 'deepdeck-harness-ui.png'),
  DEEPSEEK_DESKTOP_NODE_BINARY: process.execPath, DEEPSEEK_DESKTOP_WORKSPACE: root,
  DEEPSEEK_HARNESS_PATH: join(root, 'vendor/deepseek-harness') };
delete env.ELECTRON_RUN_AS_NODE;
try {
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL('./harness-ui-fixture.cjs', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const report = chunk => process.stdout.write(chunk.toString().replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]'));
    child.stdout.on('data', report); child.stderr.on('data', report);
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
} finally { await rm(profile, { recursive: true, force: true }); }
