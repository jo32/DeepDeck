import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// The outer repository owns Git hooks. Upstream's installer explicitly skips
// hook/worktree configuration in CI, which also makes its install safe when the
// checkout is represented by a Git submodule rather than a standalone worktree.
const result = spawnSync(
  pnpm,
  ["--dir", "vendor/deepseek-harness", "install", "--frozen-lockfile"],
  {
    cwd: workspaceRoot,
    env: { ...process.env, CI: "true" },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
