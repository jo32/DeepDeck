import { spawn } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODEX_CONNECT_VERSION = "0.1.0-alpha.4.20";
const DSH_PLUGIN_API_VERSION = "0.1.1-rc.2";
const REACT_PEER_RANGE = "^18.2.0 || ^19.1.1";
const BUN_VERSION = "1.4.0";

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

function pluginRoot(runtimeRoot, pluginName) {
  const harnessPackage = {
    "dsh-codex-connect": "dsh-codex-connect",
    "provider-aware-web": "@deepdeck/dsh-provider-aware-web",
  }[pluginName];
  if (harnessPackage !== undefined) {
    return join(runtimeRoot, "harness", "node_modules", harnessPackage);
  }
  return join(runtimeRoot, "plugins", pluginName);
}

async function verifyCodexConnectContract(root, manifest) {
  if (manifest.version !== CODEX_CONNECT_VERSION) {
    throw new Error(`Bundled Codex Connect version is ${manifest.version ?? "missing"}`);
  }
  const dshPeers = Object.entries(manifest.peerDependencies ?? {})
    .filter(([name]) => name.startsWith("@deepseek-ai/dsh-"));
  if (dshPeers.length === 0 || dshPeers.some(([, version]) => version !== DSH_PLUGIN_API_VERSION)) {
    throw new Error("Bundled Codex Connect does not declare a 0.1.1-rc.2-only DSH peer contract");
  }
  if (manifest.peerDependencies?.react !== REACT_PEER_RANGE) {
    throw new Error("Bundled Codex Connect does not declare its React 18/19 peer contract");
  }
  const compatibility = JSON.parse(await readFile(join(root, "compatibility.json"), "utf8"));
  if (compatibility.dshPluginApi?.version !== DSH_PLUGIN_API_VERSION) {
    throw new Error("Bundled Codex Connect compatibility.json does not report Harness 0.1.1-rc.2");
  }
}

async function verifyWebBoot(runtimeRoot, manifest, nodeBinary, cli) {
  const dshHome = await mkdtemp(join(tmpdir(), "deepdeck-runtime-verify-"));
  let child;
  let exitPromise;
  let bootTimeout;
  try {
    for (const plugin of manifest.plugins) {
      const root = pluginRoot(runtimeRoot, plugin);
      const pluginManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      if (typeof pluginManifest.name !== "string") throw new Error(`Runtime plugin has no package name: ${plugin}`);
      const link = join(dshHome, "profiles", "web", "node_modules", ...pluginManifest.name.split("/"));
      await mkdir(dirname(link), { recursive: true });
      await symlink(root, link, process.platform === "win32" ? "junction" : "dir");
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
    const deadline = Date.now() + 15_000;
    let response;
    let lastFetchError;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Bundled Harness exited after announcing readiness:\n${output}`);
      }
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
        break;
      } catch (error) {
        lastFetchError = error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (!response) {
      throw new Error(`Bundled Harness readiness endpoint was unreachable: ${String(lastFetchError)}\n${output}`);
    }
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
const pnpm = manifest.platform === "win32"
  ? join(runtimeRoot, "runtime", "bin", "pnpm.cmd")
  : join(runtimeRoot, "runtime", "bin", "pnpm");

const requiredRuntimePaths = [
  nodeBinary,
  pnpm,
  cli,
  join(runtimeRoot, "branding", "brand.json"),
  join(runtimeRoot, "cordis.patch.yml"),
];
let bundledBun;
let bundledComputerUse;
for (const plugin of manifest.plugins) {
  const root = pluginRoot(runtimeRoot, plugin);
  const pluginManifestPath = join(root, "package.json");
  requiredRuntimePaths.push(pluginManifestPath);
  if (await pathExists(pluginManifestPath)) {
    const pluginManifest = JSON.parse(await readFile(pluginManifestPath, "utf8"));
    const bundlePatch = pluginManifest.dsh?.bundle?.patch;
    if (typeof bundlePatch !== "string" || bundlePatch.length === 0) {
      throw new Error(`Runtime plugin ${plugin} does not declare dsh.bundle.patch`);
    }
    requiredRuntimePaths.push(join(root, bundlePatch));
    if (plugin === "dsh-codex-connect") await verifyCodexConnectContract(root, pluginManifest);
    const clientExport = pluginManifest.exports?.["./client"];
    const clientEntry = typeof clientExport === "string" ? clientExport : clientExport?.default;
    requiredRuntimePaths.push(join(root, pluginManifest.main ?? "lib/index.js"));
    if (typeof clientEntry === "string") requiredRuntimePaths.push(join(root, clientEntry));
    if (plugin === "bun-plugin-builder") {
      bundledBun = join(root, "node_modules", "bun", "bin", "bun.exe");
      requiredRuntimePaths.push(bundledBun);
    }
    if (plugin === "computer-use") {
      const pinnedVersion = pluginManifest.dependencies?.["open-computer-use"];
      const dependencyRoot = join(root, "node_modules", "open-computer-use");
      const dependencyManifest = JSON.parse(await readFile(join(dependencyRoot, "package.json"), "utf8"));
      if (dependencyManifest.version !== pinnedVersion) {
        throw new Error(
          `Bundled Open Computer Use ${String(dependencyManifest.version)} does not match pin ${String(pinnedVersion)}`,
        );
      }
      const nativeRuntime = manifest.platform === "darwin"
        ? join(dependencyRoot, "dist", "Open Computer Use.app", "Contents", "MacOS", "OpenComputerUse")
        : manifest.platform === "win32"
          ? join(dependencyRoot, "dist", "windows", manifest.architecture === "arm64" ? "arm64" : "amd64", "open-computer-use.exe")
          : join(dependencyRoot, "dist", "linux", manifest.architecture === "arm64" ? "arm64" : "amd64", "open-computer-use");
      bundledComputerUse = {
        launcher: join(dependencyRoot, "bin", "open-computer-use"),
        version: pinnedVersion,
      };
      requiredRuntimePaths.push(
        join(root, "lib", "app-agent-proxy.js"),
        join(dependencyRoot, "LICENSE"),
        bundledComputerUse.launcher,
        nativeRuntime,
      );
    }
  }
}
for (const required of requiredRuntimePaths) {
  if (!(await pathExists(required))) throw new Error(`Runtime resource is missing: ${required}`);
}

const remainingLink = await findSymlink(join(runtimeRoot, "harness"));
if (remainingLink) throw new Error(`Runtime contains a non-portable symbolic link: ${remainingLink}`);

const help = await run(nodeBinary, [cli, "--help"]);
if (!help.includes("Usage: dsh")) throw new Error("Bundled Harness CLI did not return its help output");
const pnpmVersion = await run(pnpm, ["--version"]);
if (pnpmVersion.trim() !== "12.0.0") throw new Error(`Bundled pnpm returned ${JSON.stringify(pnpmVersion.trim())}`);
if (!bundledBun) throw new Error("Runtime manifest omitted the Bun plugin builder");
const bunVersion = await run(bundledBun, ["--version"]);
if (bunVersion.trim() !== BUN_VERSION) throw new Error(`Bundled Bun returned ${JSON.stringify(bunVersion.trim())}`);
if (!bundledComputerUse) throw new Error("Runtime manifest omitted the Computer Use plugin");
const computerUseVersion = await run(nodeBinary, [bundledComputerUse.launcher, "--version"]);
if (computerUseVersion.trim() !== bundledComputerUse.version) {
  throw new Error(`Bundled Open Computer Use returned ${JSON.stringify(computerUseVersion.trim())}`);
}
await verifyWebBoot(runtimeRoot, manifest, nodeBinary, cli);
console.log(
  `verify-runtime: DeepDeck ${manifest.applicationVersion}, Node ${manifest.nodeVersion}, ${manifest.platform}-${manifest.architecture}`,
);
