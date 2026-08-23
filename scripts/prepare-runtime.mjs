import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  access,
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { arch as hostArch, platform as hostPlatform } from "node:process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const harnessRoot = join(workspaceRoot, "vendor", "deepseek-harness");
const generatedRoot = join(workspaceRoot, ".deepdeck");
const runtimeRoot = join(generatedRoot, "runtime");
const nodeVersion = "24.18.1";

const NODE_ARCHIVES = Object.freeze({
  "darwin-arm64": {
    filename: `node-v${nodeVersion}-darwin-arm64.tar.gz`,
    sha256: "eb02f7fab96d3d67de40c5ec8566096fcb4c2026728787683ae5a97eb612b941",
  },
  "darwin-x64": {
    filename: `node-v${nodeVersion}-darwin-x64.tar.gz`,
    sha256: "6fb20fceacbb157c2f95825b80df4a454a0f6d81cdcd7bb81eeae9147e0e76ec",
  },
  "win32-x64": {
    filename: `node-v${nodeVersion}-win-x64.zip`,
    sha256: "ec56b84a7551893ab2324ebdfdc4ab974a63b4781162600b68a1293cc3e53765",
  },
});

const PLUGINS = Object.freeze([
  "desktop-chrome",
  "home-hero",
  "agent-preset-sections",
  "marketplace-desktop-bridge",
  "bun-plugin-builder",
  "first-run",
  "app-conversations",
  "dsh-codex-connect",
  "community-market",
]);

const HARNESS_PLUGIN_PACKAGES = Object.freeze({
  "dsh-codex-connect": "dsh-codex-connect",
});

function pluginSource(pluginName) {
  if (Object.hasOwn(HARNESS_PLUGIN_PACKAGES, pluginName)) {
    return join(workspaceRoot, "node_modules", HARNESS_PLUGIN_PACKAGES[pluginName]);
  }
  return join(workspaceRoot, "plugins", pluginName);
}

function pluginDestination(pluginName, destinationRoot) {
  const packageName = HARNESS_PLUGIN_PACKAGES[pluginName];
  if (pluginName === "community-market") {
    return join(destinationRoot, "harness", "node_modules", "dsh-community-market");
  }
  return packageName !== undefined
    ? join(destinationRoot, "harness", "node_modules", packageName)
    : join(destinationRoot, "plugins", pluginName);
}

function parseOptions(arguments_) {
  const options = { platform: hostPlatform, arch: hostArch };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--platform" || argument === "--arch") {
      const value = arguments_[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith("--platform=")) {
      options.platform = argument.slice("--platform=".length);
    } else if (argument.startsWith("--arch=")) {
      options.arch = argument.slice("--arch=".length);
    } else if (argument !== "--") {
      throw new Error(`Unknown runtime option: ${argument}`);
    }
  }
  return options;
}

function assertGeneratedPath(path) {
  const fromGeneratedRoot = relative(generatedRoot, resolve(path));
  if (!fromGeneratedRoot || fromGeneratedRoot.startsWith("..") || fromGeneratedRoot.includes(`..${sep}`)) {
    throw new Error(`Refusing to mutate a path outside ${generatedRoot}: ${path}`);
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function run(command, arguments_, options = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd ?? workspaceRoot,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with ${signal ?? `code ${String(code)}`}`));
    });
  });
}

async function sha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function obtainNodeArchive(descriptor) {
  const cacheDirectory = join(generatedRoot, "cache", "node");
  const archivePath = join(cacheDirectory, descriptor.filename);
  await mkdir(cacheDirectory, { recursive: true });

  if (await pathExists(archivePath)) {
    if (await sha256(archivePath) === descriptor.sha256) return archivePath;
    assertGeneratedPath(archivePath);
    await rm(archivePath, { force: true });
  }

  const url = `https://nodejs.org/dist/v${nodeVersion}/${descriptor.filename}`;
  console.log(`prepare-runtime: downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download Node.js (${response.status} ${response.statusText})`);
  const contents = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(contents).digest("hex");
  if (digest !== descriptor.sha256) {
    throw new Error(`Node.js archive checksum mismatch: expected ${descriptor.sha256}, got ${digest}`);
  }
  await writeFile(archivePath, contents, { mode: 0o600 });
  return archivePath;
}

async function extractNode(archivePath, destination, platform) {
  await mkdir(destination, { recursive: true });
  const arguments_ = platform === "win32"
    ? ["-xf", archivePath, "-C", destination, "--strip-components", "1"]
    : ["-xzf", archivePath, "-C", destination, "--strip-components", "1"];
  await run("tar", arguments_);
  const nodeBinary = platform === "win32"
    ? join(destination, "node.exe")
    : join(destination, "bin", "node");
  if (!(await pathExists(nodeBinary))) throw new Error(`Extracted Node.js binary is missing: ${nodeBinary}`);
  if (platform !== "win32") await chmod(nodeBinary, 0o755);
  const retainedRootEntries = new Set([
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    platform === "win32" ? "node.exe" : "bin",
  ]);
  for (const entry of await readdir(destination)) {
    if (!retainedRootEntries.has(entry)) await rm(join(destination, entry), { recursive: true, force: true });
  }
  if (platform !== "win32") {
    for (const entry of await readdir(join(destination, "bin"))) {
      if (entry !== "node") await rm(join(destination, "bin", entry), { recursive: true, force: true });
    }
  }
  return nodeBinary;
}

async function deployHarness(target, workspaceDirectory) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await mkdir(dirname(target), { recursive: true });
  await run(
    pnpm,
    [
      "--dir",
      workspaceDirectory,
      "--filter",
      "@deepdeck/desktop-runtime",
      "deploy",
      "--prod",
      "--legacy",
      "--config.node-linker=hoisted",
      "--config.auto-install-peers=false",
      "--config.link-workspace-packages=true",
      target,
    ],
    { env: { CI: "true" } },
  );
}

async function collectPackageManifests(directory, levels) {
  if (levels === 0) {
    const manifestPath = join(directory, "package.json");
    return (await pathExists(manifestPath)) ? [manifestPath] : [];
  }
  const manifests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    manifests.push(...await collectPackageManifests(join(directory, entry.name), levels - 1));
  }
  return manifests;
}

async function loadHarnessWorkspacePackages() {
  const manifests = [
    ...await collectPackageManifests(join(harnessRoot, "packages"), 2),
    ...await collectPackageManifests(join(harnessRoot, "vendor"), 1),
    ...await collectPackageManifests(join(harnessRoot, "apps"), 1),
    ...await collectPackageManifests(join(harnessRoot, "native", "landlock-run", "packages"), 1),
    join(harnessRoot, "native", "landlock-run", "package.json"),
    join(harnessRoot, "examples", "package.json"),
    join(harnessRoot, "python", "sdk-runtime", "package.json"),
  ];
  const packages = new Map();
  for (const manifestPath of manifests) {
    if (!(await pathExists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (typeof manifest.name === "string") packages.set(manifest.name, { manifest, manifestPath });
  }
  return packages;
}

async function resolvedExternalVersion(packageName, issuerManifestPath, declaredRange) {
  const localManifestPath = join(
    dirname(issuerManifestPath),
    "node_modules",
    ...packageName.split("/"),
    "package.json",
  );
  if (await pathExists(localManifestPath)) {
    const manifest = JSON.parse(await readFile(localManifestPath, "utf8"));
    if (typeof manifest.version === "string") return manifest.version;
  }

  try {
    const require = createRequire(issuerManifestPath);
    const resolvedEntry = require.resolve(packageName);
    let directory = dirname(resolvedEntry);
    while (directory !== dirname(directory)) {
      const candidate = join(directory, "package.json");
      if (await pathExists(candidate)) {
        const manifest = JSON.parse(await readFile(candidate, "utf8"));
        if (manifest.name === packageName && typeof manifest.version === "string") return manifest.version;
      }
      directory = dirname(directory);
    }
  } catch {
    // Some ESM-only peers do not expose an entry under the require condition.
  }

  if (typeof declaredRange === "string" && declaredRange.length > 0) return declaredRange;
  throw new Error(`Unable to resolve required external peer: ${packageName}`);
}

async function runtimeRootDependencies(workspacePackages) {
  const rootDependencies = new Map([["@deepseek-ai/dsh", "workspace:^"]]);
  const visited = new Set();
  const queue = ["@deepseek-ai/dsh"];

  for (let index = 0; index < queue.length; index += 1) {
    const packageName = queue[index];
    if (visited.has(packageName)) continue;
    visited.add(packageName);
    const current = workspacePackages.get(packageName);
    if (!current) continue;
    const { manifest } = current;
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      if (workspacePackages.has(dependency) && !visited.has(dependency)) queue.push(dependency);
    }
    for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[peer]?.optional === true) continue;
      if (workspacePackages.has(peer)) {
        if (!rootDependencies.has(peer)) rootDependencies.set(peer, "workspace:^");
        if (!visited.has(peer)) queue.push(peer);
      } else if (!rootDependencies.has(peer)) {
        rootDependencies.set(peer, await resolvedExternalVersion(peer, current.manifestPath, range));
      }
    }
  }
  return {
    rootDependencies,
    workspacePackageCount: visited.size,
    workspacePackages: [...visited]
      .map((packageName) => workspacePackages.get(packageName))
      .filter(Boolean),
  };
}

async function linkDirectory(source, destination) {
  await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
}

async function createRuntimeWorkspace(directory) {
  await mkdir(directory, { recursive: true });
  const workspacePackages = await loadHarnessWorkspacePackages();
  const closure = await runtimeRootDependencies(workspacePackages);
  const { rootDependencies, workspacePackageCount } = closure;

  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify({
      name: "@deepdeck/runtime-workspace",
      private: true,
      type: "module",
      packageManager: "pnpm@11.7.0",
    }, null, 2)}\n`,
  );
  await cp(join(harnessRoot, "pnpm-workspace.yaml"), join(directory, "pnpm-workspace.yaml"));
  await cp(join(harnessRoot, "pnpm-lock.yaml"), join(directory, "pnpm-lock.yaml"));
  for (const name of ["packages", "vendor", "native", "python", "examples", "website", "patches"]) {
    const source = join(harnessRoot, name);
    if (await pathExists(source)) await linkDirectory(source, join(directory, name));
  }
  await mkdir(join(directory, "apps"), { recursive: true });
  for (const name of ["cli", "web"]) {
    await linkDirectory(join(harnessRoot, "apps", name), join(directory, "apps", name));
  }
  const deployRoot = join(directory, "apps", "deepdeck-runtime");
  await mkdir(deployRoot, { recursive: true });
  await writeFile(
    join(deployRoot, "package.json"),
    `${JSON.stringify({
      name: "@deepdeck/desktop-runtime",
      version: "1.0.0",
      private: true,
      type: "module",
      description: "Generated dependency-only deploy root for DeepDeck",
      dependencies: Object.fromEntries([...rootDependencies].sort(([left], [right]) => left.localeCompare(right))),
    }, null, 2)}\n`,
  );
  return {
    peerRootCount: rootDependencies.size - 1,
    workspacePackageCount,
    workspacePackages: closure.workspacePackages,
  };
}

async function removeBinDirectories(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name === ".bin") {
      await rm(path, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeBinDirectories(path);
    }
  }
}

async function firstSymlink(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) return path;
    if (metadata.isDirectory()) {
      const nested = await firstSymlink(path);
      if (nested) return nested;
    }
  }
  return undefined;
}

async function materializeSymlinks(directory) {
  await removeBinDirectories(directory);
  let link = await firstSymlink(directory);
  while (link) {
    const source = await realpath(link);
    const nestedNodeModules = join(source, "node_modules");
    await rm(link, { recursive: true, force: true });
    await cp(source, link, {
      recursive: true,
      dereference: true,
      filter: (path) => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
    });
    link = await firstSymlink(directory);
  }
}

async function materializeWorkspaceOverrides(nodeModules) {
  const overrides = new Map([
    ["cosmokit", join(harnessRoot, "vendor", "cosmokit")],
    ["schemastery", join(harnessRoot, "vendor", "schemastery")],
  ]);
  for (const [packageName, source] of overrides) {
    const destination = join(nodeModules, "@deepseek-ai", packageName);
    const nestedNodeModules = join(source, "node_modules");
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
    });
  }
}

async function materializeMissingWorkspacePackages(nodeModules, workspacePackages) {
  let copied = 0;
  for (const { manifest, manifestPath } of workspacePackages) {
    if (manifest.name === "@deepseek-ai/dsh") continue;
    const destination = join(nodeModules, ...manifest.name.split("/"));
    if (await pathExists(destination)) continue;
    const source = dirname(manifestPath);
    const nestedNodeModules = join(source, "node_modules");
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
    });
    copied += 1;
  }
  if (copied > 0) console.log(`prepare-runtime: materialized ${copied} pruned workspace packages`);
}

async function copyPluginDependencies(source, destination, dependencies) {
  const pending = Object.keys(dependencies ?? {});
  const copied = new Set();
  while (pending.length > 0) {
    const packageName = pending.pop();
    if (!packageName || copied.has(packageName)) continue;
    copied.add(packageName);
    const dependencySource = join(source, "node_modules", packageName);
    if (!(await pathExists(dependencySource))) {
      throw new Error(`Plugin dependency is not installed: ${packageName}`);
    }
    const dependencyDestination = join(destination, "node_modules", packageName);
    await mkdir(dirname(dependencyDestination), { recursive: true });
    await cp(dependencySource, dependencyDestination, { recursive: true, dereference: true });
    const dependencyManifest = JSON.parse(
      await readFile(join(dependencySource, "package.json"), "utf8"),
    );
    pending.push(...Object.keys(dependencyManifest.dependencies ?? {}));
  }
}

async function copyPlugin(pluginName, destinationRoot) {
  const source = pluginSource(pluginName);
  const destination = pluginDestination(pluginName, destinationRoot);
  if (pluginName === "community-market") {
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await mkdir(dirname(destination), { recursive: true });
    await run(
      pnpm,
      [
        "--filter",
        "dsh-community-market",
        "deploy",
        "--prod",
        "--config.inject-workspace-packages=true",
        "--config.node-linker=hoisted",
        destination,
      ],
      { env: { CI: "true" } },
    );
    return;
  }
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const clientExport = manifest.exports?.["./client"];
  const clientEntry = typeof clientExport === "string" ? clientExport : clientExport?.default;
  const hostEntry = manifest.main ?? "lib/index.js";
  for (const required of ["package.json", "cordis.patch.yml", hostEntry, clientEntry]) {
    if (typeof required !== "string") throw new Error(`Plugin ${pluginName} has no client entry`);
    if (!(await pathExists(join(source, required)))) {
      throw new Error(`Plugin ${pluginName} is not built: missing ${required}`);
    }
  }
  await mkdir(destination, { recursive: true });
  await cp(join(source, "package.json"), join(destination, "package.json"));
  await cp(join(source, "cordis.patch.yml"), join(destination, "cordis.patch.yml"));
  await cp(join(source, "lib"), join(destination, "lib"), { recursive: true });
  for (const optionalDirectory of ["client", "data", "src"]) {
    if (await pathExists(join(source, optionalDirectory))) {
      await cp(join(source, optionalDirectory), join(destination, optionalDirectory), { recursive: true });
    }
  }
  for (const optional of ["LICENSE", "README.md", "README.zh.md", "compatibility.json"]) {
    if (await pathExists(join(source, optional))) await cp(join(source, optional), join(destination, optional));
  }
  await copyPluginDependencies(source, destination, manifest.dependencies);
}

async function bundlePnpm(destinationRoot, platform) {
  const require = createRequire(import.meta.url);
  const pnpmSource = dirname(require.resolve("pnpm"));
  const pnpmDestination = join(destinationRoot, "runtime", "pnpm");
  const tools = join(destinationRoot, "runtime", "bin");
  await cp(pnpmSource, pnpmDestination, { recursive: true, dereference: true });
  await mkdir(tools, { recursive: true });
  if (platform === "win32") {
    await writeFile(
      join(tools, "pnpm.cmd"),
      '@"%~dp0..\\node\\node.exe" "%~dp0..\\pnpm\\bin\\pnpm.mjs" %*\r\n',
    );
    return;
  }
  const launcher = join(tools, "pnpm");
  await writeFile(
    launcher,
    '#!/bin/sh\ntool_dir=${0%/*}\nexec "$tool_dir/../node/bin/node" "$tool_dir/../pnpm/bin/pnpm.mjs" "$@"\n',
  );
  await chmod(launcher, 0o755);
}

async function prepare() {
  const options = parseOptions(process.argv.slice(2));
  const key = `${options.platform}-${options.arch}`;
  const descriptor = NODE_ARCHIVES[key];
  if (!descriptor) throw new Error(`Unsupported runtime target: ${key}`);
  if (options.platform !== hostPlatform || options.arch !== hostArch) {
    throw new Error(
      `Runtime target ${key} must be prepared on its native runner; current host is ${hostPlatform}-${hostArch}`,
    );
  }

  for (const path of [
    join(harnessRoot, "apps", "cli", "lib", "bin.js"),
    ...PLUGINS.map((plugin) => join(pluginSource(plugin), "package.json")),
  ]) {
    if (!(await pathExists(path))) throw new Error(`Required build output is missing: ${path}`);
  }

  await mkdir(generatedRoot, { recursive: true });
  const temporaryRoot = join(generatedRoot, `runtime-${key}-${process.pid}.tmp`);
  const runtimeWorkspace = join(generatedRoot, `workspace-${key}-${process.pid}.tmp`);
  assertGeneratedPath(temporaryRoot);
  assertGeneratedPath(runtimeWorkspace);
  await rm(temporaryRoot, { recursive: true, force: true });
  await rm(runtimeWorkspace, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });

  try {
    const archive = await obtainNodeArchive(descriptor);
    const nodeBinary = await extractNode(archive, join(temporaryRoot, "runtime", "node"), options.platform);
    await bundlePnpm(temporaryRoot, options.platform);

    const closure = await createRuntimeWorkspace(runtimeWorkspace);
    const deployedHarness = join(temporaryRoot, "harness");
    await deployHarness(deployedHarness, runtimeWorkspace);
    const deployNodeModules = join(deployedHarness, "node_modules");
    const baseBundle = join(deployNodeModules, "@deepseek-ai", "dsh-base");
    if (!(await pathExists(baseBundle))) throw new Error("Harness deploy omitted the required dsh-base bundle");
    const sourceCli = join(harnessRoot, "apps", "cli");
    const sourceCliNodeModules = join(sourceCli, "node_modules");
    const deployCli = join(deployedHarness, "apps", "cli");
    await cp(sourceCli, deployCli, {
      recursive: true,
      dereference: true,
      filter: (path) => path !== sourceCliNodeModules && !path.startsWith(`${sourceCliNodeModules}${sep}`),
    });
    await materializeWorkspaceOverrides(deployNodeModules);
    await materializeSymlinks(deployNodeModules);
    await materializeMissingWorkspacePackages(deployNodeModules, closure.workspacePackages);
    if (!(await pathExists(baseBundle))) throw new Error("Harness materialization removed the required dsh-base bundle");

    for (const plugin of PLUGINS) await copyPlugin(plugin, temporaryRoot);
    await materializeSymlinks(deployNodeModules);
    await cp(join(workspaceRoot, "branding"), join(temporaryRoot, "branding"), { recursive: true });
    await cp(
      join(workspaceRoot, "plugins", "desktop-chrome", "cordis.patch.yml"),
      join(temporaryRoot, "cordis.patch.yml"),
    );

    const desktopPackage = JSON.parse(
      await readFile(join(workspaceRoot, "apps", "desktop", "package.json"), "utf8"),
    );
    await writeFile(
      join(temporaryRoot, "runtime-manifest.json"),
      `${JSON.stringify({
        application: "DeepDeck",
        applicationVersion: desktopPackage.version,
        architecture: options.arch,
        nodeVersion,
        platform: options.platform,
        plugins: PLUGINS,
        runtimePeerRoots: closure.peerRootCount,
        workspacePackages: closure.workspacePackageCount,
      }, null, 2)}\n`,
    );

    await run(nodeBinary, [join(deployCli, "lib", "bin.js"), "--help"]);
    await run(process.execPath, [join(workspaceRoot, "scripts", "verify-runtime.mjs"), `--root=${temporaryRoot}`]);

    assertGeneratedPath(runtimeRoot);
    await rm(runtimeRoot, { recursive: true, force: true });
    await rename(temporaryRoot, runtimeRoot);
    console.log(`prepare-runtime: prepared ${key} runtime at ${runtimeRoot}`);
  } catch (error) {
    if (process.env.DEEPDECK_KEEP_RUNTIME_TEMP === "1") {
      console.error(`prepare-runtime: kept failed runtime at ${temporaryRoot}`);
      console.error(`prepare-runtime: kept workspace at ${runtimeWorkspace}`);
    } else {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
    throw error;
  } finally {
    if (process.env.DEEPDECK_KEEP_RUNTIME_TEMP !== "1") {
      await rm(runtimeWorkspace, { recursive: true, force: true });
    }
  }
}

await prepare();
