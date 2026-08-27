import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CACHE_VERSION = 1;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const desktopBuildInputs = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "branding",
  "patches",
  "scripts/deepdeck-client-bundle.ts",
  "scripts/ensure-codex-connect-dependencies.mjs",
  "scripts/verify-codex-connect-patch.mjs",
  "apps/desktop/package.json",
  "apps/desktop/scripts",
  "apps/desktop/src",
  "apps/desktop/tsconfig.main.json",
  "apps/desktop/tsconfig.renderer.json",
  "apps/desktop/vite.config.ts",
  "plugins/marketplace-desktop-bridge",
  "plugins/bun-plugin-builder",
  "plugins/first-run",
  "plugins/app-conversations",
  "plugins/computer-use",
  "plugins/provider-aware-web",
  "plugins/desktop-chrome",
  "plugins/home-hero",
  "plugins/agent-preset-sections",
  "vendor/dsh-codex-connect/package.json",
  "vendor/dsh-codex-connect/src",
  "vendor/dsh-codex-connect/tsconfig.json",
  "vendor/dsh-codex-connect/tsconfig.client.json",
];

export const desktopBuildArtifacts = [
  "apps/desktop/dist/main/index.js",
  "apps/desktop/dist/preload/index.cjs",
  "apps/desktop/dist/renderer/index.html",
  "plugins/marketplace-desktop-bridge/lib/index.js",
  "plugins/marketplace-desktop-bridge/lib/client.js",
  "plugins/bun-plugin-builder/lib/index.js",
  "plugins/bun-plugin-builder/lib/client.js",
  "plugins/first-run/lib/index.js",
  "plugins/first-run/lib/client.js",
  "plugins/app-conversations/lib/index.js",
  "plugins/app-conversations/lib/client.js",
  "plugins/computer-use/lib/index.js",
  "plugins/computer-use/lib/client.js",
  "plugins/provider-aware-web/lib/index.js",
  "plugins/provider-aware-web/lib/client.js",
  "plugins/desktop-chrome/lib/index.js",
  "plugins/desktop-chrome/lib/client.js",
  "plugins/home-hero/lib/index.js",
  "plugins/home-hero/lib/client.js",
  "plugins/agent-preset-sections/lib/index.js",
  "plugins/agent-preset-sections/lib/client.js",
];

export const desktopBuildCachePath = ".deepdeck/cache/desktop-build.json";

const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "lib",
  "node_modules",
]);

const ignoredInputPaths = new Set([
  "plugins/desktop-chrome/src/client/generated-brand.ts",
]);

function portablePath(path) {
  return path.split(sep).join("/");
}

async function pathMetadata(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function collectInputFiles(workspaceRoot, inputPaths) {
  const files = [];

  async function visit(absolutePath) {
    const metadata = await pathMetadata(absolutePath);
    const relativePath = portablePath(relative(workspaceRoot, absolutePath));
    if (!metadata) {
      files.push({ kind: "missing", path: relativePath });
      return;
    }
    if (ignoredInputPaths.has(relativePath)) return;
    if (metadata.isSymbolicLink()) {
      files.push({ kind: "symlink", path: relativePath, target: await readlink(absolutePath) });
      return;
    }
    if (metadata.isDirectory()) {
      if (ignoredDirectoryNames.has(relativePath.split("/").at(-1))) return;
      const entries = await readdir(absolutePath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) await visit(resolve(absolutePath, entry.name));
      return;
    }
    if (metadata.isFile()) files.push({ kind: "file", path: relativePath, absolutePath });
  }

  for (const inputPath of [...inputPaths].sort()) {
    await visit(resolve(workspaceRoot, inputPath));
  }
  return files;
}

export async function calculateDesktopBuildFingerprint(
  workspaceRoot,
  inputPaths = desktopBuildInputs,
) {
  const hash = createHash("sha256");
  hash.update(`desktop-build-cache:${CACHE_VERSION}\0node:${process.version}\0`);
  const files = await collectInputFiles(workspaceRoot, inputPaths);
  files.sort((left, right) => left.path.localeCompare(right.path));
  for (const file of files) {
    hash.update(`${file.kind}\0${file.path}\0`);
    if (file.kind === "file") hash.update(await readFile(file.absolutePath));
    else if (file.kind === "symlink") hash.update(file.target);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function missingDesktopBuildArtifacts(
  workspaceRoot,
  artifactPaths = desktopBuildArtifacts,
) {
  const missing = [];
  for (const artifactPath of artifactPaths) {
    const metadata = await pathMetadata(resolve(workspaceRoot, artifactPath));
    if (!metadata?.isFile()) missing.push(artifactPath);
  }
  return missing;
}

async function readBuildCache(workspaceRoot, cachePath) {
  try {
    return JSON.parse(await readFile(resolve(workspaceRoot, cachePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export async function inspectDesktopBuildCache({
  workspaceRoot,
  inputPaths = desktopBuildInputs,
  artifactPaths = desktopBuildArtifacts,
  cachePath = desktopBuildCachePath,
}) {
  const [fingerprint, missingArtifacts, cache] = await Promise.all([
    calculateDesktopBuildFingerprint(workspaceRoot, inputPaths),
    missingDesktopBuildArtifacts(workspaceRoot, artifactPaths),
    readBuildCache(workspaceRoot, cachePath),
  ]);
  if (missingArtifacts.length > 0) {
    return {
      fresh: false,
      fingerprint,
      reason: `缺少 ${missingArtifacts.length} 个构建产物`,
      missingArtifacts,
    };
  }
  if (cache?.version !== CACHE_VERSION || typeof cache.fingerprint !== "string") {
    return { fresh: false, fingerprint, reason: "没有可用的构建缓存记录", missingArtifacts };
  }
  if (cache.fingerprint !== fingerprint) {
    return { fresh: false, fingerprint, reason: "源码或构建配置已变化", missingArtifacts };
  }
  return { fresh: true, fingerprint, reason: "构建产物可复用", missingArtifacts };
}

export async function recordDesktopBuildCache({
  workspaceRoot,
  inputPaths = desktopBuildInputs,
  artifactPaths = desktopBuildArtifacts,
  cachePath = desktopBuildCachePath,
  fingerprint,
}) {
  const missingArtifacts = await missingDesktopBuildArtifacts(workspaceRoot, artifactPaths);
  if (missingArtifacts.length > 0) {
    throw new Error(`无法记录构建缓存，缺少产物：${missingArtifacts.join(", ")}`);
  }
  const resolvedFingerprint = fingerprint
    ?? await calculateDesktopBuildFingerprint(workspaceRoot, inputPaths);
  const absoluteCachePath = resolve(workspaceRoot, cachePath);
  const temporaryPath = `${absoluteCachePath}.${process.pid}.tmp`;
  await mkdir(dirname(absoluteCachePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify({
    version: CACHE_VERSION,
    fingerprint: resolvedFingerprint,
    recordedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  await rename(temporaryPath, absoluteCachePath);
}

async function invalidateDesktopBuildCache(workspaceRoot, cachePath = desktopBuildCachePath) {
  await rm(resolve(workspaceRoot, cachePath), { force: true });
}

function runDesktopBuild(workspaceRoot) {
  return new Promise((resolvePromise, reject) => {
    const executableName = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const localPnpm = resolve(workspaceRoot, "node_modules", ".bin", executableName);
    const command = existsSync(localPnpm) ? localPnpm : executableName;
    const arguments_ = ["run", "build:desktop"];
    const child = spawn(command, arguments_, {
      cwd: workspaceRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`桌面构建失败（${signal ?? `exit ${code ?? "unknown"}`}）`));
    });
  });
}

export async function ensureDesktopBuild(workspaceRoot = repositoryRoot) {
  const status = await inspectDesktopBuildCache({ workspaceRoot });
  if (status.fresh) {
    console.log("DeepDeck：源码未变化，复用已有桌面构建产物。");
    return;
  }

  console.log(`DeepDeck：${status.reason}，重新构建桌面产物…`);
  const fingerprintBeforeBuild = status.fingerprint;
  await invalidateDesktopBuildCache(workspaceRoot);
  await runDesktopBuild(workspaceRoot);
  const fingerprintAfterBuild = await calculateDesktopBuildFingerprint(workspaceRoot);
  if (fingerprintAfterBuild !== fingerprintBeforeBuild) {
    await invalidateDesktopBuildCache(workspaceRoot);
    throw new Error("构建期间源码发生变化，未复用可能不一致的产物；请重新运行 pnpm start。");
  }
  await recordDesktopBuildCache({ workspaceRoot, fingerprint: fingerprintAfterBuild });
}

async function main() {
  const mode = process.argv[2] ?? "ensure";
  if (mode === "ensure") {
    await ensureDesktopBuild();
    return;
  }
  if (mode === "record") {
    await recordDesktopBuildCache({ workspaceRoot: repositoryRoot });
    console.log("DeepDeck：已记录桌面构建缓存。");
    return;
  }
  if (mode === "status") {
    const status = await inspectDesktopBuildCache({ workspaceRoot: repositoryRoot });
    console.log(`DeepDeck：${status.reason}。`);
    process.exitCode = status.fresh ? 0 : 1;
    return;
  }
  throw new Error(`未知模式：${mode}`);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
