const { join } = require("node:path");

/**
 * open-computer-use 0.3.1 recognizes its canonical release identifier and its
 * development identifier. The production DeepDeck bundle must not reuse the
 * canonical identifier after electron-builder signs the nested app with the
 * DeepDeck team: macOS TCC would otherwise show one ambiguous row for two
 * different signing requirements.
 */
const COMPUTER_USE_PACKAGED_IDENTITY = Object.freeze({
  bundleIdentifier: "com.ifuryst.opencomputeruse.dev",
  bundleName: "DeepDeck Computer Use",
  bundleVariant: "dev",
  executableName: "OpenComputerUse",
  relativeBundlePath: join(
    "Contents",
    "Resources",
    "plugins",
    "computer-use",
    "node_modules",
    "open-computer-use",
    "dist",
    "Open Computer Use.app",
  ),
});

async function applyComputerUsePackagedIdentity(appPath, execFileAsync) {
  const bundlePath = join(appPath, COMPUTER_USE_PACKAGED_IDENTITY.relativeBundlePath);
  const infoPath = join(bundlePath, "Contents", "Info.plist");
  const replacements = [
    ["CFBundleIdentifier", COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier],
    ["CFBundleName", COMPUTER_USE_PACKAGED_IDENTITY.bundleName],
    ["CFBundleDisplayName", COMPUTER_USE_PACKAGED_IDENTITY.bundleName],
    ["OpenComputerUseAppVariant", COMPUTER_USE_PACKAGED_IDENTITY.bundleVariant],
  ];

  for (const [key, value] of replacements) {
    await execFileAsync("/usr/bin/plutil", ["-replace", key, "-string", value, infoPath]);
  }

  return { bundlePath, infoPath };
}

module.exports = {
  COMPUTER_USE_PACKAGED_IDENTITY,
  applyComputerUsePackagedIdentity,
};
