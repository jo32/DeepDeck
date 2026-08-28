const { execFile } = require("node:child_process");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { promisify } = require("node:util");
const {
  COMPUTER_USE_PACKAGED_IDENTITY,
  verifyComputerUseExecutableIdentity,
} = require("./computer-use-identity.cjs");

const execFileAsync = promisify(execFile);

async function plistValue(infoPath, key) {
  const { stdout } = await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, infoPath]);
  return stdout.trim();
}

async function signingMetadata(bundlePath) {
  const { stderr } = await execFileAsync("/usr/bin/codesign", ["-dvv", bundlePath]);
  const team = /^TeamIdentifier=(.+)$/m.exec(stderr)?.[1]?.trim();
  const identifier = /^Identifier=(.+)$/m.exec(stderr)?.[1]?.trim();
  if (!team) throw new Error(`Signed bundle has no TeamIdentifier: ${bundlePath}`);
  if (!identifier) throw new Error(`Signed bundle has no Identifier: ${bundlePath}`);
  return { team, identifier };
}

exports.default = async function verifyNestedComputerUseSignature(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (context.packager.config.extraMetadata?.deepdeckLocalBuild === true) return;

  const appPath = join(context.appOutDir, "DeepDeck.app");
  const computerUseApp = join(appPath, COMPUTER_USE_PACKAGED_IDENTITY.relativeBundlePath);
  const computerUseInfo = join(computerUseApp, "Contents", "Info.plist");
  const computerUseExecutable = join(
    computerUseApp,
    "Contents",
    "MacOS",
    COMPUTER_USE_PACKAGED_IDENTITY.executableName,
  );

  const bundleIdentifier = await plistValue(computerUseInfo, "CFBundleIdentifier");
  const displayName = await plistValue(computerUseInfo, "CFBundleDisplayName");
  if (bundleIdentifier !== COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier) {
    throw new Error(`Unexpected packaged Computer Use identifier: ${bundleIdentifier}`);
  }
  if (displayName !== COMPUTER_USE_PACKAGED_IDENTITY.bundleName) {
    throw new Error(`Unexpected packaged Computer Use name: ${displayName}`);
  }
  verifyComputerUseExecutableIdentity(await readFile(computerUseExecutable));

  await execFileAsync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", computerUseApp]);
  await execFileAsync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

  const [appSigning, computerUseSigning] = await Promise.all([
    signingMetadata(appPath),
    signingMetadata(computerUseApp),
  ]);
  if (computerUseSigning.identifier !== COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier) {
    throw new Error(`Unexpected signed Computer Use identifier: ${computerUseSigning.identifier}`);
  }
  if (computerUseSigning.team !== appSigning.team) {
    throw new Error(
      `Computer Use signing team ${computerUseSigning.team} does not match DeepDeck ${appSigning.team}`,
    );
  }
};
