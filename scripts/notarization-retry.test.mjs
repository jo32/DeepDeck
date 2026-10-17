import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { Script } from 'node:vm';

const desktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const builder = createRequire(desktop.resolve('electron-builder/package.json'));
const library = createRequire(builder.resolve('app-builder-lib/package.json'));
const root = dirname(library.resolve('@electron/notarize/package.json'));
const sdk = createRequire(join(root, 'lib/index.js'));
const { runAppleToolWithRetry } = sdk('./network-retry.js');
const id = 'd92f1d9a-e72a-43da-b893-4859a3997243';
const offline = { code: 1, output: `Code=-1009 The Internet connection appears to be offline https://appstoreconnect.apple.com/notary/v2/submissions/${id}` };
const lost = { code: 68, output: 'Code=-1005 The network connection was lost.' };
const quiet = { sleep: async () => {}, report: () => {} };

test('resumes a known notarization submission without uploading it again or logging credentials', async () => {
  const calls = [], reports = [], delays = [];
  const auth = { toString: () => 'credential-marker' };
  const args = ['submit', 'DeepDeck.zip', '--key', auth, '--wait', '--output-format', 'json'];
  const accepted = { code: 0, output: JSON.stringify({ id, status: 'Accepted' }) };
  const result = await runAppleToolWithRetry(async current => {
    calls.push(current);
    return calls.length === 1 ? offline : accepted;
  }, args, { sleep: async ms => delays.push(ms), report: line => reports.push(line) });
  assert.equal(result, accepted);
  assert.deepEqual(calls[1], ['wait', id, '--key', auth, '--output-format', 'json', '--timeout', '10m']);
  assert.equal(calls.filter(call => call[0] === 'submit').length, 1);
  assert.deepEqual(delays, [5000]);
  assert.equal(reports.length, 1);
  assert.ok(!reports.join('').includes('credential-marker'));
});

test('does not resubmit when the submission outcome is unknown, or retry an Apple rejection', async () => {
  for (const failure of [{ code: 1, output: 'Code=-1009 No network route' },
    { code: 65, output: JSON.stringify({ id, status: 'Invalid' }) }]) {
    let calls = 0;
    const result = await runAppleToolWithRetry(async () => { calls++; return failure; }, ['submit', 'app.zip'], quiet);
    assert.equal(result, failure);
    assert.equal(calls, 1);
  }
});

test('bounds stapling retries and preserves the final failure', async () => {
  const calls = [], delays = [];
  const args = ['stapler', 'staple', '-v', 'DeepDeck.app'];
  const result = await runAppleToolWithRetry(async current => { calls.push(current); return lost; }, args,
    { sleep: async ms => delays.push(ms), report: () => {} });
  assert.equal(result, lost);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call === args));
  assert.deepEqual(delays, [5000, 15000, 30000]);
});

test('does not retry permanent stapling or spawn errors', async () => {
  let calls = 0;
  const permanent = { code: 65, output: 'The code signature is invalid.' };
  assert.equal(await runAppleToolWithRetry(async () => { calls++; return permanent; }, ['stapler'], quiet), permanent);
  assert.equal(calls, 1);
  await assert.rejects(runAppleToolWithRetry(async () => { throw new Error('spawn ENOENT'); }, ['stapler'], quiet), /ENOENT/);
});

// Load the installed upstream modules with only their native process boundary
// replaced. Their original credential validation and accepted-status gates run.
function upstream(file, spawn) {
  const module = { exports: {} };
  const load = request => request === './spawn' ? { spawn }
    : request === './network-retry' ? { runAppleToolWithRetry: (operation, args) => runAppleToolWithRetry(operation, args, quiet) }
      : sdk(request);
  new Script(`(function(require,module,exports){${readFileSync(join(root, 'lib', file), 'utf8')}\n})`, { filename: file })
    .runInNewContext()(load, module, module.exports);
  return module.exports;
}

test('installed notarytool integration resumes the submission and still enforces acceptance', async () => {
  const calls = [];
  const api = upstream('notarytool.js', async (command, args) => {
    if (command === 'ditto') return { code: 0, output: '' };
    calls.push(args);
    if (args[1] === 'submit') return offline;
    return { code: 0, output: JSON.stringify({ id, status: 'Accepted' }) };
  });
  await api.notarizeAndWaitForNotaryTool({ appPath: '/fixture/DeepDeck.app', keychainProfile: 'fixture' });
  assert.deepEqual(calls.map(args => args[1]), ['submit', 'wait', 'log']);
  const rejected = upstream('notarytool.js', async (command, args) => command === 'ditto'
    ? { code: 0, output: '' } : args[1] === 'submit' ? offline
      : { code: 65, output: JSON.stringify({ id, status: 'Invalid' }) });
  await assert.rejects(rejected.notarizeAndWaitForNotaryTool({ appPath: '/fixture/DeepDeck.app', keychainProfile: 'fixture' }), /Failed to notarize/);
});

test('installed staple integration retries network loss and still rejects permanent failures', async () => {
  let calls = 0;
  const api = upstream('staple.js', async (command, args) => {
    assert.equal(command, 'xcrun');
    assert.deepEqual([...args], ['stapler', 'staple', '-v', 'DeepDeck.app']);
    return ++calls === 1 ? lost : { code: 0, output: 'The staple and validate action worked!' };
  });
  await api.stapleApp({ appPath: '/fixture/DeepDeck.app' });
  assert.equal(calls, 2);
  const rejected = upstream('staple.js', async () => ({ code: 65, output: 'Invalid signature' }));
  await assert.rejects(rejected.stapleApp({ appPath: '/fixture/DeepDeck.app' }), /Failed to staple/);
});
