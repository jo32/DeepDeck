import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(workspaceRoot, "release");

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Continue to the next electron-builder output convention.
    }
  }
  return undefined;
}

const executable = process.platform === "darwin"
  ? await firstExisting([
      join(releaseRoot, `mac-${process.arch}`, "DeepDeck.app", "Contents", "MacOS", "DeepDeck"),
      join(releaseRoot, "mac", "DeepDeck.app", "Contents", "MacOS", "DeepDeck"),
    ])
  : await firstExisting([
      join(releaseRoot, "win-unpacked", "DeepDeck.exe"),
      join(releaseRoot, `win-${process.arch}-unpacked`, "DeepDeck.exe"),
    ]);

if (!executable) {
  throw new Error(`Unable to find the local DeepDeck package below ${releaseRoot}`);
}

const child = spawn(executable, [], {
  cwd: workspaceRoot,
  env: { ...process.env, DEEPDECK_LOCAL_BUILD: "1" },
  shell: false,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  process.stderr.write(`Unable to launch DeepDeck: ${error.message}\n`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal === "SIGINT") process.exitCode = 130;
  else if (signal === "SIGTERM") process.exitCode = 143;
  else process.exitCode = code ?? 1;
});
