import { execFile } from "node:child_process";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch as hostArch, platform as hostPlatform } from "node:process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(workspaceRoot, "apps", "desktop");

function parseOptions(arguments_) {
  const options = { production: false, arch: hostArch, appPath: undefined };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--local") options.production = false;
    else if (argument === "--production") options.production = true;
    else if (argument === "--arch") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--arch requires a value");
      options.arch = value;
      index += 1;
    } else if (argument.startsWith("--arch=")) options.arch = argument.slice("--arch=".length);
    else if (argument === "--app") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--app requires a value");
      options.appPath = resolve(value);
      index += 1;
    } else if (argument.startsWith("--app=")) options.appPath = resolve(argument.slice("--app=".length));
    else if (argument !== "--") throw new Error(`Unknown package verification option: ${argument}`);
  }
  if (!options.appPath) {
    const outputDirectory = options.arch === "x64" ? "mac" : `mac-${options.arch}`;
    options.appPath = join(workspaceRoot, "release", outputDirectory, "DeepDeck.app");
  }
  return options;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function plistValue(plistPath, key) {
  const { stdout } = await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath]);
  return stdout.trim();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertNoElectronFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (/^electron(?:\.|$)/i.test(entry.name)) {
      throw new Error(`Packaged app retains an Electron-branded file: ${path}`);
    }
    if (entry.isDirectory()) await assertNoElectronFiles(path);
  }
}

async function verifyHelpers(frameworksPath) {
  const helperBundles = (await readdir(frameworksPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (helperBundles.length < 3) throw new Error("DeepDeck helper app bundles are missing");
  for (const helper of helperBundles) {
    if (!helper.name.startsWith("DeepDeck Helper")) throw new Error(`Unexpected helper name: ${helper.name}`);
    const info = join(frameworksPath, helper.name, "Contents", "Info.plist");
    const expectedName = helper.name.slice(0, -".app".length);
    for (const key of ["CFBundleName", "CFBundleDisplayName", "CFBundleExecutable"]) {
      assertEqual(await plistValue(info, key), expectedName, `${helper.name} ${key}`);
    }
    const identifier = await plistValue(info, "CFBundleIdentifier");
    if (!identifier.startsWith("com.jo32.deepdeck.helper")) {
      throw new Error(`Unexpected helper bundle identifier: ${identifier}`);
    }
  }
}

const options = parseOptions(process.argv.slice(2));
if (hostPlatform !== "darwin") throw new Error("The current package verifier supports macOS app bundles");
const appPath = options.appPath;
const contents = join(appPath, "Contents");
const resources = join(contents, "Resources");
const info = join(contents, "Info.plist");
const desktopPackage = JSON.parse(await readFile(join(desktopRoot, "package.json"), "utf8"));

for (const required of [
  info,
  join(contents, "MacOS", "DeepDeck"),
  join(resources, "app.asar"),
  join(resources, "icon.icns"),
  join(resources, "runtime-manifest.json"),
  join(resources, "runtime", "node", "bin", "node"),
  join(resources, "runtime", "bin", "pnpm"),
  join(resources, "deepdeck-update-helper"),
  join(resources, "harness", "apps", "cli", "lib", "bin.js"),
]) {
  if (!(await pathExists(required))) throw new Error(`Packaged resource is missing: ${required}`);
}

for (const [key, value] of Object.entries({
  CFBundleName: "DeepDeck",
  CFBundleDisplayName: "DeepDeck",
  CFBundleExecutable: "DeepDeck",
  CFBundleIdentifier: "com.jo32.deepdeck",
  CFBundleShortVersionString: desktopPackage.version,
  CFBundleIconFile: "icon.icns",
})) {
  assertEqual(await plistValue(info, key), value, key);
}

await verifyHelpers(join(contents, "Frameworks"));
await assertNoElectronFiles(resources);

const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const {
  COMPUTER_USE_PACKAGED_IDENTITY,
} = requireFromDesktop("./build/computer-use-identity.cjs");
const { listPackage } = requireFromDesktop("@electron/asar");
const asarFiles = new Set(listPackage(join(resources, "app.asar")));
for (const required of [
  "/dist/main/index.js",
  "/dist/main/native-identity.js",
  "/dist/main/runtime-paths.js",
  "/dist/main/auto-update.js",
  "/dist/main/update-relauncher.js",
  "/dist/main/update-transaction.js",
  "/dist/preload/index.js",
  "/dist/renderer/index.html",
  "/node_modules/electron-updater/out/main.js",
]) {
  if (!asarFiles.has(required)) throw new Error(`app.asar is missing: ${required}`);
}

if (options.production && !(await pathExists(join(resources, "app-update.yml")))) {
  throw new Error("Production package is missing app-update.yml");
}

const runtimeManifest = JSON.parse(await readFile(join(resources, "runtime-manifest.json"), "utf8"));
assertEqual(runtimeManifest.application, "DeepDeck", "runtime application");
assertEqual(runtimeManifest.applicationVersion, desktopPackage.version, "runtime application version");
assertEqual(runtimeManifest.architecture, options.arch, "runtime architecture");

await execFileAsync(
  process.execPath,
  [join(workspaceRoot, "scripts", "verify-runtime.mjs"), `--root=${resources}`],
  { maxBuffer: 2 * 1024 * 1024 },
);

const computerUseApp = join(appPath, COMPUTER_USE_PACKAGED_IDENTITY.relativeBundlePath);
const computerUseInfo = join(computerUseApp, "Contents", "Info.plist");
for (const [key, value] of Object.entries({
  CFBundleIdentifier: COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier,
  CFBundleName: COMPUTER_USE_PACKAGED_IDENTITY.bundleName,
  CFBundleDisplayName: COMPUTER_USE_PACKAGED_IDENTITY.bundleName,
  CFBundleExecutable: COMPUTER_USE_PACKAGED_IDENTITY.executableName,
  OpenComputerUseAppVariant: COMPUTER_USE_PACKAGED_IDENTITY.bundleVariant,
})) {
  assertEqual(await plistValue(computerUseInfo, key), value, `Computer Use ${key}`);
}

if (options.production) {
  async function signingTeam(path) {
    const { stderr } = await execFileAsync("/usr/bin/codesign", ["-dvv", path]);
    const team = /^TeamIdentifier=(.+)$/m.exec(stderr)?.[1]?.trim();
    if (!team) throw new Error(`Signed bundle has no TeamIdentifier: ${path}`);
    return team;
  }

  const [deepDeckTeam, computerUseTeam] = await Promise.all([
    signingTeam(appPath),
    signingTeam(computerUseApp),
  ]);
  assertEqual(computerUseTeam, deepDeckTeam, "Computer Use signing team");
  await execFileAsync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", computerUseApp]);
}

const executableStat = await lstat(join(contents, "MacOS", "DeepDeck"));
if ((executableStat.mode & 0o111) === 0) throw new Error("DeepDeck executable is not executable");
const updateHelper = join(resources, "deepdeck-update-helper");
const updateHelperStat = await lstat(updateHelper);
if ((updateHelperStat.mode & 0o111) === 0) throw new Error("Update helper is not executable");
const { stdout: helperSelfCheck } = await execFileAsync(updateHelper, ["--self-check"]);
assertEqual(helperSelfCheck.trim(), "deepdeck-update-helper ok", "update helper self-check");
const { stdout: helperBundleIdentity } = await execFileAsync(updateHelper, ["--bundle-identity"]);
assertEqual(helperBundleIdentity.trim(), "none", "update helper bundle identity");
console.log(
  `verify-package: DeepDeck ${desktopPackage.version}, macOS ${options.arch}, ${options.production ? "production" : "local"}`,
);
