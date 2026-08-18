import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const METADATA_CACHE = "no-cache, no-store, must-revalidate";

function parseOptions(arguments_) {
  const options = { dryRun: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const name = equals >= 0 ? argument.slice(0, equals) : argument;
    const value = equals >= 0 ? argument.slice(equals + 1) : arguments_[++index];
    if (!["--manifest", "--phase"].includes(name) || !value) {
      throw new Error(`Unknown or incomplete R2 publish option: ${argument}`);
    }
    options[name.slice(2)] = value;
  }
  if (!options.manifest) throw new Error("--manifest is required");
  options.manifest = resolve(options.manifest);
  if (!new Set(["immutable", "latest"]).has(options.phase)) throw new Error("--phase must be immutable or latest");
  return options;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function contentType(name) {
  if (name.endsWith(".yml")) return "application/yaml";
  if (name.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".blockmap")) return "application/octet-stream";
  if (name.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}

async function localDescription(path) {
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

function assertRecord(actual, expected, label) {
  for (const key of ["size", "sha256", "sha512"]) {
    if (actual[key] !== expected[key]) throw new Error(`${label} local ${key} does not match release-manifest.json`);
  }
}

async function runAws(arguments_, allowFailure = false) {
  let stdout = "";
  let stderr = "";
  const result = await new Promise((resolveRun, rejectRun) => {
    const child = spawn("aws", arguments_, {
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        AWS_DEFAULT_REGION: "auto",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => resolveRun({ code, signal }));
  });
  if (result.code !== 0 && !allowFailure) {
    throw new Error(`aws exited with ${result.signal ?? `code ${String(result.code)}`}: ${stderr.trim()}`);
  }
  return { ...result, stdout, stderr };
}

async function headObject(configuration, record) {
  const result = await runAws([
    "s3api",
    "head-object",
    "--bucket",
    configuration.bucket,
    "--key",
    record.key,
    "--endpoint-url",
    configuration.endpoint,
    "--output",
    "json",
  ], true);
  if (result.code === 0) return JSON.parse(result.stdout);
  if (/\b(?:404|NoSuchKey|Not Found)\b/i.test(result.stderr)) return undefined;
  throw new Error(`Unable to inspect R2 object ${record.key}: ${result.stderr.trim()}`);
}

function verifyHead(head, record, expectedCache) {
  if (Number(head.ContentLength) !== record.size) throw new Error(`R2 Content-Length mismatch: ${record.key}`);
  if (head.CacheControl !== expectedCache) throw new Error(`R2 Cache-Control mismatch: ${record.key}`);
  if (head.Metadata?.sha256 !== record.sha256) throw new Error(`R2 SHA256 metadata mismatch: ${record.key}`);
}

async function putObject(configuration, record, localPath, immutable) {
  const expectedCache = immutable ? IMMUTABLE_CACHE : METADATA_CACHE;
  if (immutable) {
    const existing = await headObject(configuration, record);
    if (existing) {
      verifyHead(existing, record, expectedCache);
      console.log(`publish-r2: immutable object already matches ${record.key}`);
      return;
    }
  }
  const arguments_ = [
    "s3api",
    "put-object",
    "--bucket",
    configuration.bucket,
    "--key",
    record.key,
    "--body",
    localPath,
    "--content-type",
    contentType(record.name),
    "--cache-control",
    expectedCache,
    "--metadata",
    JSON.stringify({ sha256: record.sha256, sha512: record.sha512 }),
    "--endpoint-url",
    configuration.endpoint,
  ];
  if (immutable) arguments_.push("--if-none-match", "*");
  await runAws(arguments_);
  const head = await headObject(configuration, record);
  if (!head) throw new Error(`R2 object is missing after upload: ${record.key}`);
  verifyHead(head, record, expectedCache);
}

function publicUrl(baseUrl, key, verificationId) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const url = new URL(encodedKey, `${baseUrl}/`);
  url.searchParams.set("deepdeck_verify", verificationId);
  return url;
}

async function retry(label, operation, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveWait) => setTimeout(resolveWait, 3_000));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts`, { cause: lastError });
}

async function verifyPublicImmutable(configuration, record) {
  const url = publicUrl(configuration.baseUrl, record.key, `${configuration.version}-${record.sha256.slice(0, 12)}`);
  await retry(`Public verification for ${record.key}`, async () => {
    const head = await fetch(url, {
      method: "HEAD",
      headers: { "Accept-Encoding": "identity" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!head.ok) throw new Error(`HEAD returned HTTP ${head.status}`);
    if (Number(head.headers.get("content-length")) !== record.size) throw new Error("HEAD Content-Length mismatch");

    const range = await fetch(url, {
      headers: { "Accept-Encoding": "identity", Range: "bytes=0-0" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (range.status !== 206) throw new Error(`Range returned HTTP ${range.status}, expected 206`);
    if (range.headers.get("content-range") !== `bytes 0-0/${record.size}`) {
      throw new Error(`Unexpected Content-Range: ${range.headers.get("content-range")}`);
    }
    await range.body?.cancel();

    const response = await fetch(url, {
      headers: { "Accept-Encoding": "identity" },
      cache: "no-store",
      signal: AbortSignal.timeout(600_000),
    });
    if (!response.ok || !response.body) throw new Error(`GET returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) !== record.size) throw new Error("GET Content-Length mismatch");
    const hash = createHash("sha256");
    for await (const chunk of response.body) hash.update(chunk);
    if (hash.digest("hex") !== record.sha256) throw new Error("public SHA256 mismatch");
  });
}

async function verifyPublicMetadata(configuration, record) {
  const url = publicUrl(configuration.baseUrl, record.key, `${configuration.version}-${record.sha256.slice(0, 12)}`);
  await retry(`Public metadata verification for ${record.key}`, async () => {
    const response = await fetch(url, {
      headers: { "Accept-Encoding": "identity" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`GET returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) !== record.size) throw new Error("Content-Length mismatch");
    const contents = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(contents).digest("hex") !== record.sha256) {
      throw new Error("published latest metadata does not match this release");
    }
  });
}

const options = parseOptions(process.argv.slice(2));
const manifest = JSON.parse(await readFile(options.manifest, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.application !== "DeepDeck" || manifest.channel !== "stable") {
  throw new Error("Unsupported release manifest");
}
const manifestRoot = dirname(options.manifest);
const records = options.phase === "immutable"
  ? manifest.feeds.flatMap((feed) => feed.files)
  : manifest.feeds.map((feed) => feed.metadata);
for (const record of records) {
  const localPath = resolve(manifestRoot, record.localPath);
  if (!localPath.startsWith(`${manifestRoot}/`)) throw new Error(`Release manifest path escapes its root: ${record.localPath}`);
  assertRecord(await localDescription(localPath), record, record.key);
}

if (options.dryRun) {
  console.log(`publish-r2: dry-run validated ${records.length} ${options.phase} objects for DeepDeck ${manifest.version}`);
  process.exit(0);
}

const accountId = requiredEnvironment("R2_ACCOUNT_ID");
requiredEnvironment("R2_ACCESS_KEY_ID");
requiredEnvironment("R2_SECRET_ACCESS_KEY");
const bucket = requiredEnvironment("R2_BUCKET");
const baseUrlValue = requiredEnvironment("UPDATE_BASE_URL").replace(/\/$/, "");
const baseUrl = new URL(baseUrlValue);
if (baseUrl.protocol !== "https:" || baseUrl.hostname.endsWith(".r2.dev")) {
  throw new Error("UPDATE_BASE_URL must be an HTTPS R2 custom domain");
}
const configuration = {
  accountId,
  bucket,
  baseUrl: baseUrl.href.replace(/\/$/, ""),
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  version: manifest.version,
};

for (const record of records) {
  const localPath = resolve(manifestRoot, record.localPath);
  await putObject(configuration, record, localPath, options.phase === "immutable");
  if (options.phase === "immutable") await verifyPublicImmutable(configuration, record);
  else await verifyPublicMetadata(configuration, record);
}
console.log(`publish-r2: published and verified ${records.length} ${options.phase} objects`);
