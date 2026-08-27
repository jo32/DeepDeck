import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const harnessRoot = join(workspaceRoot, "vendor", "deepseek-harness");
const harnessManifest = JSON.parse(readFileSync(join(harnessRoot, "package.json"), "utf8"));
const packageManager = harnessManifest.packageManager;
if (typeof packageManager !== "string" || !/^pnpm@\d+\.\d+\.\d+$/.test(packageManager)) {
  throw new Error("Harness must declare an exact pnpm packageManager version");
}
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";

// The outer repository owns Git hooks. Upstream's installer explicitly skips
// hook/worktree configuration in CI, which also makes its install safe when the
// checkout is represented by a Git submodule rather than a standalone worktree.
const result = spawnSync(
  corepack,
  [packageManager, "install", "--frozen-lockfile"],
  {
    cwd: harnessRoot,
    env: { ...process.env, CI: "true" },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
