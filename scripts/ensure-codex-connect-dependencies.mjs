import { spawn } from "node:child_process";
import { access, cp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexConnectRoot = join(repositoryRoot, "vendor", "dsh-codex-connect");
const manifestPath = join(codexConnectRoot, "package.json");

async function ensureSourceChatTypes() {
  // This historical source checkout omits ui-chat, which its tool Slot types
  // import. Keep those tests on their own API instead of inheriting the app's RC.
  const require = createRequire(join(repositoryRoot, "package.json"));
  const source = dirname(require.resolve("@deepdeck/codex-source-chat-types/package.json"));
  const expected = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const sourceManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expected.version !== sourceManifest.devDependencies["@deepseek-ai/dsh-client-ui-tool"]) {
    throw new Error("Codex source chat types must match its locked tool-view API");
  }
  const destination = join(codexConnectRoot, "node_modules", "@deepseek-ai", "dsh-client-ui-chat");
  try {
    const installed = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
    if (installed.version === expected.version) return;
    throw new Error(`Unexpected source ui-chat version: ${installed.version}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await cp(source, destination, {
    recursive: true,
    filter: path => path !== join(source, "node_modules") && !path.startsWith(`${join(source, "node_modules")}${sep}`),
  });
}

async function missingDirectDependencies() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const names = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  });
  const missing = [];
  for (const name of names) {
    try {
      await access(join(codexConnectRoot, "node_modules", ...name.split("/"), "package.json"));
    } catch {
      missing.push(name);
    }
  }
  return missing;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Codex Connect dependency install failed (${signal ?? `exit ${code ?? "unknown"}`}).`));
    });
  });
}

const missing = await missingDirectDependencies();
if (missing.length === 0) {
  await ensureSourceChatTypes();
  console.log("Codex Connect dependencies are ready.");
  process.exit(0);
}

console.log(`Installing Codex Connect dependencies (missing: ${missing.join(", ")})...`);
const localPnpm = join(repositoryRoot, "node_modules", "pnpm", "bin", "pnpm.cjs");
try {
  await access(localPnpm);
  await run(process.execPath, [
    localPnpm,
    "--dir",
    codexConnectRoot,
    "install",
    "--frozen-lockfile",
  ]);
} catch (cause) {
  if (cause?.code !== "ENOENT") throw cause;
  await run("pnpm", [
    "--dir",
    codexConnectRoot,
    "install",
    "--frozen-lockfile",
  ]);
}

const stillMissing = await missingDirectDependencies();
if (stillMissing.length > 0) {
  throw new Error(`Codex Connect dependencies are still missing: ${stillMissing.join(", ")}`);
}
await ensureSourceChatTypes();
