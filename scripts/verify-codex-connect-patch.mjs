import { createRequire } from "node:module";
import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const expectedPackageVersion = "0.1.0-alpha.4.20";
const expectedDshVersion = "0.1.1-rc.2";
const expectedReactRange = "^18.2.0 || ^19.1.1";
const expectedPiAiVersion = "0.82.1";
const staleDshVersions = ["0.1.0-rc.7", "0.1.0-rc.8"];
const textExtensions = new Set([".d.ts", ".js", ".json", ".md", ".yaml", ".yml"]);

function fail(message) {
  throw new Error(`verify-codex-connect-patch: ${message}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function collectTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTextFiles(path));
      continue;
    }
    if ([...textExtensions].some((extension) => entry.name.endsWith(extension))) files.push(path);
  }
  return files;
}

const manifestPath = require.resolve("dsh-codex-connect/package.json");
const packageRoot = dirname(manifestPath);
const physicalPackageRoot = await realpath(packageRoot);
const physicalWorkspaceRoot = await realpath(workspaceRoot);
const relativeRoot = relative(physicalWorkspaceRoot, physicalPackageRoot);
if (relativeRoot.startsWith("..") || relativeRoot.includes(`..${sep}`)) {
  fail(`resolved package is outside the workspace: ${physicalPackageRoot}`);
}

const manifest = await readJson(manifestPath);
const compatibility = await readJson(join(packageRoot, "compatibility.json"));
if (manifest.name !== "dsh-codex-connect" || manifest.version !== expectedPackageVersion) {
  fail(`expected dsh-codex-connect ${expectedPackageVersion}`);
}

const dshPeers = Object.entries(manifest.peerDependencies ?? {})
  .filter(([name]) => name.startsWith("@deepseek-ai/dsh-"));
if (dshPeers.length === 0) fail("package declares no DSH plugin API peers");
for (const [name, version] of dshPeers) {
  if (version !== expectedDshVersion) fail(`${name} peer is ${version}, expected ${expectedDshVersion}`);
}
if (manifest.peerDependencies?.react !== expectedReactRange) {
  fail(`React peer is ${manifest.peerDependencies?.react ?? "missing"}, expected ${expectedReactRange}`);
}
if (manifest.peerDependencies?.["@earendil-works/pi-ai"] !== expectedPiAiVersion) {
  fail("pi-ai peer contract drifted");
}
if (compatibility.dshPluginApi?.version !== expectedDshVersion) {
  fail("compatibility.json does not declare Harness 0.1.1-rc.2");
}

const textFiles = await collectTextFiles(packageRoot);
let claimsConfigurableProvider = false;
for (const path of textFiles) {
  const text = await readFile(path, "utf8");
  if (/registerConfigurableProviders\(\[\{\s*provider:\s*OPENAI_CODEX_PROVIDER/u.test(text)) {
    claimsConfigurableProvider = true;
  }
  const staleVersion = staleDshVersions.find((version) => text.includes(version));
  if (staleVersion !== undefined) {
    fail(`stale ${staleVersion} contract remains in ${relative(packageRoot, path)}`);
  }
}
if (claimsConfigurableProvider) {
  fail("compiled bundle still duplicates Harness 0.1.1's catalog-owned openai-codex directory entry");
}

const plugin = await import(pathToFileURL(join(packageRoot, manifest.main ?? "lib/index.js")).href);
if (plugin.SUPPORTED_DSH_PLUGIN_API_VERSION !== expectedDshVersion) {
  fail("compiled doctor contract does not report Harness 0.1.1-rc.2");
}
if (plugin.COMPATIBILITY_CONTRACT?.dshPluginApi?.version !== expectedDshVersion) {
  fail("compiled compatibility contract does not report Harness 0.1.1-rc.2");
}

const report = plugin.evaluateCompatibility({
  nodeVersion: "v24.18.1",
  packageVersions: {
    "@deepseek-ai/dsh-llm": expectedDshVersion,
    "@deepseek-ai/dsh-llm-pi-ai": expectedDshVersion,
    "@earendil-works/pi-ai": expectedPiAiVersion,
  },
});
if (report.status !== "compatible") fail(`compiled compatibility evaluation returned ${report.status}`);

const installedReport = await plugin.detectCompatibility();
if (installedReport.status !== "compatible") {
  fail(`installed 0.1.1-rc.2 dependency detection returned ${installedReport.status}`);
}

console.log(
  `verify-codex-connect-patch: ${manifest.name} ${manifest.version} is patched for Harness ${expectedDshVersion}`,
);
