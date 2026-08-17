import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const harnessRoot = resolve(workspaceRoot, "vendor/deepseek-harness");
const harnessCli = resolve(harnessRoot, "apps/cli/lib/bin.js");

if (!existsSync(harnessCli)) {
  process.stderr.write(
    "The DeepDeck engine has not been built. Run `pnpm bootstrap` before starting the desktop.\n",
  );
  process.exit(1);
}

const child = spawn(
  "pnpm",
  ["--filter", "@deepseek-harness/desktop", "exec", "electron", "."],
  {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DEEPSEEK_DESKTOP_NODE_BINARY: process.execPath,
      DEEPSEEK_DESKTOP_WORKSPACE: process.env.DEEPSEEK_DESKTOP_WORKSPACE ?? workspaceRoot,
      DEEPSEEK_HARNESS_PATH: harnessRoot,
    },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  process.stderr.write(`Unable to launch Electron: ${error.message}\n`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal === "SIGINT") process.exitCode = 130;
  else if (signal === "SIGTERM") process.exitCode = 143;
  else process.exitCode = code ?? 1;
});
