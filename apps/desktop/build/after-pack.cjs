const { execFile } = require("node:child_process");
const { readdir } = require("node:fs/promises");
const { basename, join } = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

exports.default = async function applyDeepDeckBundleIdentity(context) {
  if (context.electronPlatformName !== "darwin") return;
  const frameworks = join(context.appOutDir, "DeepDeck.app", "Contents", "Frameworks");
  const entries = await readdir(frameworks, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("DeepDeck Helper") || !entry.name.endsWith(".app")) {
      continue;
    }
    const bundleName = basename(entry.name, ".app");
    const info = join(frameworks, entry.name, "Contents", "Info.plist");
    await execFileAsync("/usr/bin/plutil", ["-replace", "CFBundleName", "-string", bundleName, info]);
  }
};
