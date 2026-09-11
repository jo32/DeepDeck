import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  calculateDesktopBuildFingerprint,
  inspectDesktopBuildCache,
  recordDesktopBuildCache,
} from "./start-build-cache.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const harnessBuildCachePath = ".deepdeck/cache/harness-build.json";

export async function harnessBuildOptions(workspaceRoot) {
  const harnessRoot = resolve(workspaceRoot, "vendor/deepseek-harness");
  // Only tracked upstream inputs: ignored lib/, native binaries and incremental
  // compiler state must not invalidate the cache immediately after a build.
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: harnessRoot,
    encoding: "utf8",
  }).split("\0").filter(Boolean);
  const inputPaths = [
    "scripts/build-harness.ts",
    "scripts/install-harness.mjs",
    "scripts/harness-build-cache.mjs",
    "scripts/start-build-cache.mjs",
    ...trackedFiles.map(path => `vendor/deepseek-harness/${path}`),
  ];
  const artifacts = new Set([
    "vendor/deepseek-harness/apps/cli/lib/bin.js",
    "vendor/deepseek-harness/apps/web/dist/index.html",
    "vendor/deepseek-harness/.dsh-build/client-build-environment.json",
  ]);
  // Check the exact declarations consumed by our plugins, including new modules
  // introduced by an upstream upgrade, instead of relying only on the CLI file.
  const configDirectories = [
    "apps/desktop",
    ...(await readdir(resolve(workspaceRoot, "plugins"), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => `plugins/${entry.name}`),
  ];
  for (const directory of configDirectories) {
    for (const name of await readdir(resolve(workspaceRoot, directory))) {
      if (!/^tsconfig.*\.json$/.test(name)) continue;
      const configPath = `${directory}/${name}`;
      inputPaths.push(configPath);
      const config = JSON.parse(await readFile(resolve(workspaceRoot, configPath), "utf8"));
      for (const paths of Object.values(config.compilerOptions?.paths ?? {})) {
        for (const path of paths) {
          const absolute = resolve(workspaceRoot, directory, path);
          if (absolute.startsWith(`${harnessRoot}${sep}`) && path.endsWith(".d.ts")) {
            artifacts.add(relative(workspaceRoot, absolute));
          }
        }
      }
    }
  }
  return {
    workspaceRoot,
    inputPaths,
    artifactPaths: [...artifacts],
    cachePath: harnessBuildCachePath,
  };
}

export async function recordHarnessBuild(workspaceRoot = repositoryRoot) {
  await recordDesktopBuildCache(await harnessBuildOptions(workspaceRoot));
}

function runScript(workspaceRoot, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Harness 构建失败（exit ${result.status ?? result.signal}）`);
}

export async function ensureHarnessBuild(workspaceRoot = repositoryRoot, build = runScript) {
  const options = await harnessBuildOptions(workspaceRoot);
  const status = await inspectDesktopBuildCache(options);
  if (status.fresh) return;
  console.log(`DeepDeck：Harness ${status.reason}，安装依赖并重新构建引擎…`);
  await build(workspaceRoot, ["scripts/install-harness.mjs"]);
  await build(workspaceRoot, [
    "--import", "./vendor/deepseek-harness/node_modules/tsx/dist/loader.mjs",
    "scripts/build-harness.ts",
  ]);
  const fingerprint = await calculateDesktopBuildFingerprint(workspaceRoot, options.inputPaths);
  if (fingerprint !== status.fingerprint) {
    throw new Error("Harness 构建期间源码发生变化；请重新运行 pnpm start。");
  }
  await recordDesktopBuildCache({ ...options, fingerprint });
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  const action = process.argv[2] === "record" ? recordHarnessBuild : ensureHarnessBuild;
  action().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
