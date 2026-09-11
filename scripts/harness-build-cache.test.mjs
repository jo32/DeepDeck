import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { ensureHarnessBuild, harnessBuildOptions, recordHarnessBuild } from "./harness-build-cache.mjs";
import { inspectDesktopBuildCache, recordDesktopBuildCache } from "./start-build-cache.mjs";

const directories = [];
async function put(root, path, contents = "built") {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "deepdeck-harness-cache-"));
  directories.push(root);
  await put(root, "vendor/deepseek-harness/packages/client/ui-session/src/client/index.ts", "export {};");
  const cwd = join(root, "vendor/deepseek-harness");
  execFileSync("git", ["init", "--quiet"], { cwd });
  execFileSync("git", ["add", "."], { cwd });
  await mkdir(join(root, "apps/desktop"), { recursive: true });
  await put(root, "plugins/example/tsconfig.json", JSON.stringify({ compilerOptions: { paths: {
    "@deepseek-ai/dsh-client-ui-session/client": [
      "../../vendor/deepseek-harness/packages/client/ui-session/lib/types/client/index.d.ts",
    ],
  } } }));
  const options = await harnessBuildOptions(root);
  for (const path of options.artifactPaths) await put(root, path);
  await recordHarnessBuild(root);
  return { root, options };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

test("reuses a current Harness without installing or building", async () => {
  const { root } = await fixture();
  await ensureHarnessBuild(root, () => assert.fail("unexpected build"));
});

test("rebuilds updated upstream sources and invalidates desktop artifacts", async () => {
  const { root, options } = await fixture();
  const desktop = { workspaceRoot: root, inputPaths: [options.cachePath], artifactPaths: [] };
  await recordDesktopBuildCache(desktop);
  await put(root, "vendor/deepseek-harness/packages/client/ui-session/src/client/index.ts", "export const updated = true;");
  const commands = [];
  await ensureHarnessBuild(root, (_root, args) => commands.push(args));
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], ["scripts/install-harness.mjs"]);
  assert.equal(commands[1].at(-1), "scripts/build-harness.ts");
  assert.equal((await inspectDesktopBuildCache(options)).fresh, true);
  assert.equal((await inspectDesktopBuildCache(desktop)).fresh, false);
});

test("repairs missing client declarations even when the CLI still exists", async () => {
  const { root, options } = await fixture();
  const declaration = options.artifactPaths.find(path => path.endsWith(".d.ts"));
  assert.ok(declaration);
  await unlink(join(root, declaration));
  const commands = [];
  await ensureHarnessBuild(root, async (_root, args) => {
    commands.push(args);
    if (args.at(-1) === "scripts/build-harness.ts") await put(root, declaration);
  });
  assert.equal(commands.length, 2);
  assert.equal((await inspectDesktopBuildCache(options)).fresh, true);
});

test("does not treat generated upstream output as a source change", async () => {
  const { root, options } = await fixture();
  await put(root, "vendor/deepseek-harness/packages/client/ui-session/lib/types/tsconfig.tsbuildinfo");
  assert.equal((await inspectDesktopBuildCache(await harnessBuildOptions(root))).fresh, true);
  assert.equal((await inspectDesktopBuildCache(options)).fresh, true);
});

test("propagates build failures and does not mark stale output as fresh", async () => {
  const { root, options } = await fixture();
  await put(root, "vendor/deepseek-harness/packages/client/ui-session/src/client/index.ts", "changed");
  await assert.rejects(ensureHarnessBuild(root, () => { throw new Error("install failed"); }), /install failed/);
  assert.equal((await inspectDesktopBuildCache(options)).fresh, false);
});

test("build and check entrypoints prepare Harness before compiling plugins", async () => {
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["check", "build:desktop"]) {
    assert.ok(scripts[name].startsWith("pnpm harness:ensure && "));
  }
});
