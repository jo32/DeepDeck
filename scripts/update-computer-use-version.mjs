import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(workspaceRoot, "plugins", "computer-use", "package.json");
const registryUrl = "https://registry.npmjs.org/open-computer-use/latest";
const stableVersionPattern = /^\d+\.\d+\.\d+$/;

function compareStableVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function validateMetadata(metadata) {
  if (metadata?.name !== "open-computer-use") {
    throw new Error("npm latest metadata does not describe open-computer-use");
  }
  if (typeof metadata.version !== "string" || !stableVersionPattern.test(metadata.version)) {
    throw new Error(`npm latest is not a stable SemVer: ${String(metadata.version)}`);
  }
  if (metadata.license !== "MIT") {
    throw new Error(`open-computer-use latest has unexpected license: ${String(metadata.license)}`);
  }
  const repository = typeof metadata.repository === "string"
    ? metadata.repository
    : metadata.repository?.url;
  if (typeof repository !== "string" || !/github\.com[/:]ifuryst\/open-codex-computer-use(?:\.git)?$/i.test(repository)) {
    throw new Error(`open-computer-use latest has unexpected repository: ${String(repository)}`);
  }
  if (typeof metadata.dist?.integrity !== "string" || !metadata.dist.integrity.startsWith("sha512-")) {
    throw new Error("open-computer-use latest does not publish SHA-512 integrity metadata");
  }
  if (
    typeof metadata.dist?.tarball !== "string"
    || !metadata.dist.tarball.startsWith("https://registry.npmjs.org/open-computer-use/-/")
  ) {
    throw new Error(`open-computer-use latest has unexpected tarball origin: ${String(metadata.dist?.tarball)}`);
  }
  return metadata.version;
}

async function latestMetadata() {
  const response = await fetch(registryUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const current = manifest.dependencies?.["open-computer-use"];
if (typeof current !== "string" || !stableVersionPattern.test(current)) {
  throw new Error(`computer-use plugin must pin an exact stable version, got ${String(current)}`);
}

const metadata = await latestMetadata();
const latest = validateMetadata(metadata);
if (compareStableVersions(latest, current) < 0) {
  throw new Error(`npm latest ${latest} is older than the pinned version ${current}`);
}

let changed = false;
if (latest !== current) {
  manifest.dependencies["open-computer-use"] = latest;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  changed = true;
}

if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    `version=${latest}\nchanged=${String(changed)}\n`,
    { flag: "a" },
  );
}
console.log(
  changed
    ? `update-computer-use-version: ${current} -> ${latest}`
    : `update-computer-use-version: already current at ${current}`,
);
