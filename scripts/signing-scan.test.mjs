import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const desktopRequire = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const builderRequire = createRequire(desktopRequire.resolve('electron-builder'));
const signingRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const signingModule = signingRequire.resolve('@electron/osx-sign');

test('signing scans every binary in a large tree with only 128 file descriptors', { skip: process.platform === 'win32', timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'deepdeck-signing-scan-'));
  try {
    const expected = [];
    for (let folder = 0; folder < 32; folder++) {
      const directory = join(root, `folder-${folder}`);
      await mkdir(directory);
      const binary = join(directory, 'native.bin');
      expected.push(binary);
      await writeFile(binary, Buffer.from([0, 1, 2, 3, 0, 255]));
      await Promise.all(Array.from({ length: 64 }, (_, index) => writeFile(join(directory, `source-${index}.js`), 'export const value = 1;\n')));
    }
    const script = 'require(process.argv[1]).walkAsync(process.argv[2]).then(paths => console.log(JSON.stringify(paths))).catch(error => { console.error(error); process.exitCode = 1; });';
    // The hard limit prevents Node from raising the limit at startup.
    const { stdout } = await promisify(execFile)('bash', ['-c', 'ulimit -n 128; exec "$@"', 'signing-scan', process.execPath, '-e', script, signingModule, root], { timeout: 25000 });
    assert.deepEqual(JSON.parse(stdout).sort(), expected.sort());
  } finally { await rm(root, { recursive: true, force: true }); }
});
