import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const YAML = requireFromDesktop("yaml");
const ARCHITECTURES = Object.freeze(["arm64", "x64"]);

function parseOptions(arguments_) {
  const options = { architectures: ARCHITECTURES };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const equals = argument.indexOf("=");
    const name = equals >= 0 ? argument.slice(0, equals) : argument;
    const value = equals >= 0 ? argument.slice(equals + 1) : arguments_[++index];
    if (!["--input", "--output", "--architectures"].includes(name) || !value) {
      throw new Error(`Unknown or incomplete release asset option: ${argument}`);
    }
    if (name === "--architectures") {
      options.architectures = value.split(",").filter(Boolean);
    } else {
      options[name.slice(2)] = resolve(value);
    }
  }
  if (!options.input || !options.output) throw new Error("--input and --output are required");
  if (options.input === options.output) throw new Error("Release input and output directories must differ");
  if (options.architectures.length === 0 || options.architectures.some((arch) => !ARCHITECTURES.includes(arch))) {
    throw new Error(`--architectures must contain only: ${ARCHITECTURES.join(", ")}`);
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

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function describeFile(path) {
  const metadata = await stat(path);
  const sha256 = createHash("sha256");
  const sha512 = createHash("sha512");
  for await (const chunk of createReadStream(path)) {
    sha256.update(chunk);
    sha512.update(chunk);
  }
  return {
    size: metadata.size,
    sha256: sha256.digest("hex"),
    sha512: sha512.digest("base64"),
  };
}

async function findArchitectureRoot(input, architecture) {
  const exact = join(input, `desktop-mac-${architecture}`);
  if (await pathExists(exact)) return exact;
  const candidates = (await readdir(input, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.includes(architecture));
  if (candidates.length !== 1) {
    throw new Error(`Expected one downloaded artifact directory for macOS ${architecture}`);
  }
  return join(input, candidates[0].name);
}

async function copyDescribed(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return describeFile(destination);
}

const options = parseOptions(process.argv.slice(2));
if (!(await pathExists(options.input))) throw new Error(`Release input does not exist: ${options.input}`);
await mkdir(options.output, { recursive: true });
if ((await readdir(options.output)).length > 0) throw new Error(`Release output must be empty: ${options.output}`);

const desktopPackage = JSON.parse(await readFile(join(desktopRoot, "package.json"), "utf8"));
const githubDirectory = join(options.output, "github");
const feeds = [];
const githubAssets = [];

for (const architecture of options.architectures) {
  const architectureRoot = await findArchitectureRoot(options.input, architecture);
  const files = await walk(architectureRoot);
  const metadataFiles = files.filter((path) => basename(path) === "latest-mac.yml");
  if (metadataFiles.length !== 1) throw new Error(`Expected one latest-mac.yml for macOS ${architecture}`);
  const metadataSource = metadataFiles[0];
  const updateMetadata = YAML.parse(await readFile(metadataSource, "utf8"));
  if (updateMetadata.version !== desktopPackage.version) {
    throw new Error(`latest-mac.yml ${architecture} version does not match ${desktopPackage.version}`);
  }
  if (!Array.isArray(updateMetadata.files) || updateMetadata.files.length === 0) {
    throw new Error(`latest-mac.yml ${architecture} has no update files`);
  }

  const immutableSources = files.filter((path) => /\.(?:dmg|zip|blockmap)$/.test(path));
  const immutableDescriptions = new Map();
  for (const source of immutableSources) immutableDescriptions.set(source, await describeFile(source));
  const names = new Set(immutableSources.map((path) => basename(path)));
  if (![...names].some((name) => name.endsWith(".dmg"))) throw new Error(`macOS ${architecture} DMG is missing`);
  if (![...names].some((name) => name.endsWith(".zip"))) throw new Error(`macOS ${architecture} ZIP is missing`);
  if (![...names].some((name) => name.endsWith(".zip.blockmap"))) {
    throw new Error(`macOS ${architecture} differential ZIP blockmap is missing`);
  }
  for (const name of names) {
    if (!name.includes(desktopPackage.version) || !name.includes(architecture)) {
      throw new Error(`Versioned artifact name lacks version or architecture: ${name}`);
    }
  }

  for (const updateFile of updateMetadata.files) {
    const name = basename(new URL(updateFile.url, "https://updates.invalid/").pathname);
    const source = immutableSources.find((path) => basename(path) === name);
    if (!source) throw new Error(`latest-mac.yml references a missing file: ${name}`);
    const description = immutableDescriptions.get(source);
    if (Number(updateFile.size) !== description.size) throw new Error(`Update size mismatch for ${name}`);
    if (updateFile.sha512 !== description.sha512) throw new Error(`Update SHA512 mismatch for ${name}`);
  }

  const r2Directory = join(options.output, "r2", "stable", "darwin", architecture);
  const stagedFiles = [];
  for (const source of immutableSources.sort()) {
    const name = basename(source);
    const destination = join(r2Directory, name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    const description = immutableDescriptions.get(source);
    const record = {
      name,
      key: `stable/darwin/${architecture}/${name}`,
      localPath: relative(options.output, destination),
      ...description,
    };
    stagedFiles.push(record);

    const githubDestination = join(githubDirectory, name);
    await mkdir(githubDirectory, { recursive: true });
    await copyFile(source, githubDestination);
    githubAssets.push({ name, localPath: relative(options.output, githubDestination), ...description });
  }

  const r2Metadata = join(r2Directory, "latest-mac.yml");
  const metadataDescription = await copyDescribed(metadataSource, r2Metadata);
  const githubMetadataName = `latest-mac-${architecture}.yml`;
  const githubMetadata = join(githubDirectory, githubMetadataName);
  await copyFile(metadataSource, githubMetadata);
  githubAssets.push({
    name: githubMetadataName,
    localPath: relative(options.output, githubMetadata),
    ...metadataDescription,
  });
  feeds.push({
    platform: "darwin",
    architecture,
    baseKey: `stable/darwin/${architecture}`,
    files: stagedFiles,
    metadata: {
      name: "latest-mac.yml",
      key: `stable/darwin/${architecture}/latest-mac.yml`,
      localPath: relative(options.output, r2Metadata),
      ...metadataDescription,
    },
  });
}

const manifest = {
  schemaVersion: 1,
  application: "DeepDeck",
  version: desktopPackage.version,
  channel: "stable",
  feeds,
  githubAssets: githubAssets.sort((left, right) => left.name.localeCompare(right.name)),
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestPath = join(options.output, "release-manifest.json");
await writeFile(manifestPath, manifestText);
await writeFile(join(githubDirectory, "release-manifest.json"), manifestText);

const checksumAssets = [
  ...manifest.githubAssets,
  {
    name: "release-manifest.json",
    localPath: relative(options.output, join(githubDirectory, "release-manifest.json")),
    ...await describeFile(join(githubDirectory, "release-manifest.json")),
  },
].sort((left, right) => left.name.localeCompare(right.name));
const checksumText = `${checksumAssets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n")}\n`;
await writeFile(join(githubDirectory, "SHA256SUMS"), checksumText);
console.log(`prepare-release-assets: DeepDeck ${desktopPackage.version}, ${manifest.feeds.length} feeds, ${checksumAssets.length} checksums`);
