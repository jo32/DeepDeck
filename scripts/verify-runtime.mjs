import { spawn } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runtimeRootFromArguments(arguments_) {
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument.startsWith("--root=")) return resolve(argument.slice("--root=".length));
    if (argument === "--root") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--root requires a value");
      return resolve(value);
    }
    if (argument !== "--") throw new Error(`Unknown verify option: ${argument}`);
  }
  return join(workspaceRoot, ".deepdeck", "runtime");
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findSymlink(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) return path;
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path);
      if (nested) return nested;
    }
  }
  return undefined;
}

async function run(command, arguments_) {
  let output = "";
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      env: { ...process.env, PATH: "" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with ${signal ?? `code ${String(code)}`}:\n${output}`));
    });
  });
  return output;
}

async function stopChild(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exitPromise.then(() => true),
    new Promise((resolveStop) => setTimeout(() => resolveStop(false), 5_000)),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exitPromise;
  }
}

async function verifyWebBoot(runtimeRoot, manifest, nodeBinary, cli) {
  const dshHome = await mkdtemp(join(tmpdir(), "deepdeck-runtime-verify-"));
  let child;
  let exitPromise;
  let bootTimeout;
  try {
    for (const plugin of manifest.plugins) {
      const pluginRoot = join(runtimeRoot, "plugins", plugin);
      const pluginManifest = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
      if (typeof pluginManifest.name !== "string") throw new Error(`Runtime plugin has no package name: ${plugin}`);
      const link = join(dshHome, "profiles", "web", "node_modules", ...pluginManifest.name.split("/"));
      await mkdir(dirname(link), { recursive: true });
      await symlink(pluginRoot, link, process.platform === "win32" ? "junction" : "dir");
    }

    let output = "";
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolveBoot, rejectBoot) => {
      resolveReady = resolveBoot;
      rejectReady = rejectBoot;
    });
    child = spawn(
      nodeBinary,
      [cli, "web", "--patch", join(runtimeRoot, "cordis.patch.yml"), "--port", "0"],
      {
        cwd: runtimeRoot,
        env: { ...process.env, DSH_HOME: dshHome, PATH: "" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    exitPromise = new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal })));
    const consume = (chunk) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-100_000);
      const match = /(?:^|\r?\n)dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)(?:\s|$)/m.exec(output);
      if (match?.[1]) resolveReady(match[1]);
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", rejectReady);
    exitPromise.then(({ code, signal }) => {
      rejectReady(new Error(`Bundled Harness exited before readiness (${signal ?? `code ${String(code)}`}):\n${output}`));
    });

    const url = await Promise.race([
      ready,
      new Promise((_, rejectTimeout) => {
        bootTimeout = setTimeout(
          () => rejectTimeout(new Error(`Bundled Harness web boot timed out:\n${output}`)),
          90_000,
        );
      }),
    ]);
    clearTimeout(bootTimeout);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Bundled Harness readiness endpoint returned HTTP ${response.status}`);
  } catch (error) {
    if (child && exitPromise) await stopChild(child, exitPromise);
    throw error;
  } finally {
    clearTimeout(bootTimeout);
    if (child && exitPromise) await stopChild(child, exitPromise);
    await rm(dshHome, { recursive: true, force: true });
  }
}

const runtimeRoot = runtimeRootFromArguments(process.argv.slice(2));
const manifest = JSON.parse(await readFile(join(runtimeRoot, "runtime-manifest.json"), "utf8"));
const nodeBinary = manifest.platform === "win32"
  ? join(runtimeRoot, "runtime", "node", "node.exe")
  : join(runtimeRoot, "runtime", "node", "bin", "node");
const cli = join(runtimeRoot, "harness", "apps", "cli", "lib", "bin.js");

for (const required of [
  nodeBinary,
  cli,
  join(runtimeRoot, "branding", "brand.json"),
  join(runtimeRoot, "cordis.patch.yml"),
  ...manifest.plugins.flatMap((plugin) => [
    join(runtimeRoot, "plugins", plugin, "package.json"),
    join(runtimeRoot, "plugins", plugin, "lib", "index.js"),
    join(runtimeRoot, "plugins", plugin, "lib", "client.js"),
  ]),
]) {
  if (!(await pathExists(required))) throw new Error(`Runtime resource is missing: ${required}`);
}

const remainingLink = await findSymlink(join(runtimeRoot, "harness"));
if (remainingLink) throw new Error(`Runtime contains a non-portable symbolic link: ${remainingLink}`);

const help = await run(nodeBinary, [cli, "--help"]);
if (!help.includes("Usage: dsh")) throw new Error("Bundled Harness CLI did not return its help output");
await verifyWebBoot(runtimeRoot, manifest, nodeBinary, cli);
console.log(
  `verify-runtime: DeepDeck ${manifest.applicationVersion}, Node ${manifest.nodeVersion}, ${manifest.platform}-${manifest.architecture}`,
);
