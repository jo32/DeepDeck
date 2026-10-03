import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

// These dependencies are bundled into the sidebar's client and lazy chunks.
// Keep its host dependencies, and require review when the upstream version changes.
export function runtimeDependencies(manifest) {
  if (manifest.name !== 'dsh-better-sidebar') return manifest.dependencies;
  if (manifest.version !== '0.21.1') throw new Error('Review sidebar runtime dependencies before upgrading');
  return Object.fromEntries(['@deepseek-ai/schemastery', 'ws', 'yaml'].map(name => {
    if (!manifest.dependencies?.[name]) throw new Error(`Missing sidebar dependency: ${name}`);
    return [name, manifest.dependencies[name]];
  }));
}

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push({ path, bytes: (await stat(path)).size });
    else throw new Error(`Runtime footprint requires materialized files: ${path}`);
  }
  return result;
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Retain every executable entry point without shipping identical native binaries.
// Shell launchers use only builtins and work even with an empty PATH.
async function replaceDuplicate(path, target, arguments_ = '') {
  if (!await exists(path) || !await exists(target)) return;
  const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
  if (await hash(path) !== await hash(target)) throw new Error(`Unexpected nonidentical binary: ${path}`);
  const targetPath = relative(dirname(path), target).replaceAll('\\', '/');
  if (!/^[\w@./-]+$/.test(targetPath)) throw new Error('Unsafe runtime launcher path');
  await writeFile(path, `#!/bin/sh\ntool_dir=\${0%/*}\nexec "$tool_dir/${targetPath}" ${arguments_}"$@"\n`);
  await chmod(path, 0o755);
}

export async function slimRuntime(root, { platform, arch, debugRoot }) {
  const before = await files(root);
  let sourceMapBytes = 0;
  for (const { path, bytes } of before) {
    if (!/\.(?:[cm]?js|css|ts)\.map$/.test(path)) continue;
    if (debugRoot) {
      const target = join(debugRoot, relative(root, path));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(path, target);
    }
    await rm(path);
    sourceMapBytes += bytes;
  }
  const modules = join(root, 'harness/node_modules');
  const pty = join(modules, 'node-pty');
  if (await exists(join(pty, 'prebuilds'))) {
    for (const name of await readdir(join(pty, 'prebuilds'))) {
      if (name !== `${platform}-${arch}`) await rm(join(pty, 'prebuilds', name), { recursive: true });
    }
    if (platform !== 'win32') await rm(join(pty, 'third_party/conpty'), { recursive: true, force: true });
  }
  if (platform !== 'win32') {
    const bunModules = join(root, 'plugins/bun-plugin-builder/node_modules');
    const bun = join(bunModules, 'bun/bin/bun.exe');
    await replaceDuplicate(join(bunModules, 'bun/bin/bunx.exe'), bun, 'x ');
    const oven = join(bunModules, '@oven');
    if (await exists(oven)) {
      for (const name of await readdir(oven)) await replaceDuplicate(join(oven, name, 'bin/bun'), bun);
    }
    const browserModules = join(modules, '@deepdeck/dsh-browser/node_modules');
    await replaceDuplicate(join(browserModules, 'esbuild/bin/esbuild'),
      join(browserModules, '@esbuild', `${platform}-${arch}`, 'bin/esbuild'));
  }
  const after = await files(root);
  const sum = list => list.reduce((total, file) => total + file.bytes, 0);
  const budgetBytes = platform === 'darwin' ? 900 * 1024 * 1024 : undefined;
  if (budgetBytes && sum(after) > budgetBytes) throw new Error(`Runtime exceeds the 900 MiB macOS budget: ${sum(after)} bytes`);
  const report = { budgetBytes, beforeBytes: sum(before), afterBytes: sum(after), sourceMapBytes, removedBytes: sum(before) - sum(after) };
  await writeFile(join(root, 'runtime-size.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
