import { spawn } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(workspaceRoot, "apps", "desktop", "native", "update-helper", "main.swift");
const output = join(workspaceRoot, ".deepdeck", "update-helper", "deepdeck-update-helper");

function run(executable, arguments_) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, arguments_, { shell: false, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`swiftc exited with ${signal ?? `code ${String(code)}`}`));
    });
  });
}

export async function buildUpdateHelper(architecture) {
  if (process.platform !== "darwin") {
    throw new Error("The DeepDeck update helper can only be built on macOS");
  }
  const targetArchitecture = architecture === "x64" ? "x86_64" : "arm64";
  await mkdir(dirname(output), { recursive: true });
  await run("/usr/bin/swiftc", [
    source,
    "-swift-version", "5",
    "-O",
    "-target", `${targetArchitecture}-apple-macos12.0`,
    "-framework", "AppKit",
    "-o", output,
  ]);
  await chmod(output, 0o755);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const archArgument = process.argv.find(argument => argument.startsWith("--arch="));
  await buildUpdateHelper(archArgument?.slice("--arch=".length) ?? process.arch);
}
