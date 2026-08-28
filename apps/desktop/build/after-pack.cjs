const { execFile } = require("node:child_process");
const { readdir } = require("node:fs/promises");
const { basename, join } = require("node:path");
const { promisify } = require("node:util");
const { applyComputerUsePackagedIdentity } = require("./computer-use-identity.cjs");

const execFileAsync = promisify(execFile);

exports.default = async function applyDeepDeckBundleIdentity(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = join(context.appOutDir, "DeepDeck.app");
  const frameworks = join(appPath, "Contents", "Frameworks");
  const entries = await readdir(frameworks, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("DeepDeck Helper") || !entry.name.endsWith(".app")) {
      continue;
    }
    const bundleName = basename(entry.name, ".app");
    const info = join(frameworks, entry.name, "Contents", "Info.plist");
    await execFileAsync("/usr/bin/plutil", ["-replace", "CFBundleName", "-string", bundleName, info]);
  }

  // This hook runs before electron-builder signs nested code. Rewrite both the
  // helper plist and the audited fixed-width identity constants in its Mach-O
  // so LaunchServices, TCC, and the native permission code agree on one
  // DeepDeck-owned identifier.
  const { bundlePath: computerUseApp } = await applyComputerUsePackagedIdentity(appPath, execFileAsync);

  // Production builds are signed by electron-builder immediately after this
  // hook. Local directory builds deliberately disable that signing stage, so
  // restore a valid ad-hoc signature after changing the nested bundle's plist.
  // Without this, macOS silently refuses to launch the helper even for
  // `--version`, which makes local Computer Use testing misleading.
  if (context.packager.config.extraMetadata?.deepdeckLocalBuild === true) {
    await execFileAsync("/usr/bin/codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      computerUseApp,
    ]);
  }
};
