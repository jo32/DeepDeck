import { spawn } from "node:child_process";
import { buildUpdateHelper } from "./build-update-helper.mjs";

function parseOptions(arguments_) {
  const options = { mode: undefined, arch: process.arch };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--local") options.mode = "local";
    else if (argument === "--mac") options.mode = "mac";
    else if (argument === "--arch") {
      options.arch = arguments_[index + 1];
      index += 1;
    } else if (argument.startsWith("--arch=")) options.arch = argument.slice("--arch=".length);
    else if (argument !== "--") throw new Error(`Unknown package option: ${argument}`);
  }
  if (!options.mode) throw new Error("Pass either --local or --mac");
  if (!["arm64", "x64"].includes(options.arch)) {
    throw new Error(`Unsupported package architecture: ${options.arch}`);
  }
  return options;
}

const options = parseOptions(process.argv.slice(2));
if (options.arch !== process.arch) {
  throw new Error(`Package architecture ${options.arch} must match native runner ${process.arch}`);
}
if (options.mode === "mac" && process.platform !== "darwin") {
  throw new Error("macOS packages must be built on macOS");
}

const feedUrl = process.env.UPDATE_FEED_URL?.trim()
  || (options.mode === "local" ? "https://updates.invalid/development" : undefined);
if (!feedUrl || !feedUrl.startsWith("https://")) {
  throw new Error("Production packaging requires an HTTPS UPDATE_FEED_URL");
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const config = options.mode === "local" ? "electron-builder.local.yml" : "electron-builder.yml";
const builderArguments = [
  "--filter",
  "@deepseek-harness/desktop",
  "exec",
  "electron-builder",
  "--config",
  config,
  ...(options.mode === "local" ? ["--dir"] : ["--mac", "dmg", "zip"]),
  `--${options.arch}`,
  "--publish",
  "never",
];

await buildUpdateHelper(options.arch);

await new Promise((resolveRun, rejectRun) => {
  const child = spawn(pnpm, builderArguments, {
    env: { ...process.env, UPDATE_FEED_URL: feedUrl },
    shell: false,
    stdio: "inherit",
  });
  child.once("error", rejectRun);
  child.once("exit", (code, signal) => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`electron-builder exited with ${signal ?? `code ${String(code)}`}`));
  });
});
