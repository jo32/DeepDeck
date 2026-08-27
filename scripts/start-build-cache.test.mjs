import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  calculateDesktopBuildFingerprint,
  desktopBuildArtifacts,
  desktopBuildInputs,
  inspectDesktopBuildCache,
  recordDesktopBuildCache,
} from "./start-build-cache.mjs";

const temporaryDirectories = [];

async function fixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "deepdeck-build-cache-"));
  temporaryDirectories.push(workspaceRoot);
  await mkdir(join(workspaceRoot, "src"), { recursive: true });
  await mkdir(join(workspaceRoot, "dist"), { recursive: true });
  await writeFile(join(workspaceRoot, "src", "index.ts"), "export const value = 1;\n");
  await writeFile(join(workspaceRoot, "dist", "index.js"), "export const value = 1;\n");
  return {
    workspaceRoot,
    inputPaths: ["src"],
    artifactPaths: ["dist/index.js"],
    cachePath: ".cache/desktop-build.json",
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

test("reuses artifacts when build inputs are unchanged", async () => {
  const options = await fixture();
  await recordDesktopBuildCache(options);

  const status = await inspectDesktopBuildCache(options);

  assert.equal(status.fresh, true);
  assert.equal(status.reason, "构建产物可复用");
});

test("invalidates the cache when source contents change", async () => {
  const options = await fixture();
  const originalFingerprint = await calculateDesktopBuildFingerprint(
    options.workspaceRoot,
    options.inputPaths,
  );
  await recordDesktopBuildCache({ ...options, fingerprint: originalFingerprint });
  await writeFile(join(options.workspaceRoot, "src", "index.ts"), "export const value = 2;\n");

  const status = await inspectDesktopBuildCache(options);

  assert.equal(status.fresh, false);
  assert.equal(status.reason, "源码或构建配置已变化");
  assert.notEqual(status.fingerprint, originalFingerprint);
});

test("invalidates the cache when a required artifact is missing", async () => {
  const options = await fixture();
  await recordDesktopBuildCache(options);
  await unlink(join(options.workspaceRoot, "dist", "index.js"));

  const status = await inspectDesktopBuildCache(options);

  assert.equal(status.fresh, false);
  assert.equal(status.reason, "缺少 1 个构建产物");
  assert.deepEqual(status.missingArtifacts, ["dist/index.js"]);
});

test("tracks the provider-aware web plugin as a desktop build input and artifact", () => {
  assert.ok(desktopBuildInputs.includes("plugins/provider-aware-web"));
  assert.ok(desktopBuildArtifacts.includes("plugins/provider-aware-web/lib/index.js"));
  assert.ok(desktopBuildArtifacts.includes("plugins/provider-aware-web/lib/client.js"));
});
