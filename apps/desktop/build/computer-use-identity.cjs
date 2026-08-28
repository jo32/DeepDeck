const { readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

/**
 * open-computer-use 0.3.1 embeds its accepted bundle identifiers and default
 * agent socket directly in the universal Mach-O. DeepDeck gives the nested app
 * a product-owned identity before electron-builder signs it, so the executable
 * constants and Info.plist must change together. All substitutions are fixed
 * width and guarded by audited occurrence counts; an upstream binary change
 * fails packaging instead of shipping a partially rewritten permission client.
 */
const COMPUTER_USE_UPSTREAM_IDENTITY = Object.freeze({
  bundleIdentifier: "com.ifuryst.opencomputeruse",
  developmentBundleIdentifier: "com.ifuryst.opencomputeruse.dev",
  defaultAgentSocketName: "open-computer-use-agent.sock",
  version: "0.3.1",
});

const COMPUTER_USE_PACKAGED_IDENTITY = Object.freeze({
  bundleIdentifier: "com.jo32.deepdeck.cu-helper",
  developmentBundleIdentifier: "com.jo32.deepdeck.cu-helper.dev",
  bundleName: "DeepDeck Computer Use",
  bundleVariant: "release",
  defaultAgentSocketName: "deepdeck-computer-agent.sock",
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

const BINARY_REPLACEMENTS = Object.freeze([
  Object.freeze({
    source: COMPUTER_USE_UPSTREAM_IDENTITY.developmentBundleIdentifier,
    target: COMPUTER_USE_PACKAGED_IDENTITY.developmentBundleIdentifier,
    expectedCount: 2,
  }),
  Object.freeze({
    source: COMPUTER_USE_UPSTREAM_IDENTITY.bundleIdentifier,
    target: COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier,
    // The two development identifiers were replaced by the preceding row.
    expectedCount: 8,
  }),
  Object.freeze({
    source: COMPUTER_USE_UPSTREAM_IDENTITY.defaultAgentSocketName,
    target: COMPUTER_USE_PACKAGED_IDENTITY.defaultAgentSocketName,
    expectedCount: 2,
  }),
]);

for (const replacement of BINARY_REPLACEMENTS) {
  if (Buffer.byteLength(replacement.source) !== Buffer.byteLength(replacement.target)) {
    throw new Error(
      `Computer Use binary identity replacement must be fixed-width: ${replacement.source} -> ${replacement.target}`,
    );
  }
}

function countOccurrences(buffer, value) {
  const needle = Buffer.from(value);
  let count = 0;
  let offset = 0;
  while ((offset = buffer.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function replaceFixedWidth(buffer, source, target) {
  const output = Buffer.from(buffer);
  const sourceBytes = Buffer.from(source);
  const targetBytes = Buffer.from(target);
  let count = 0;
  let offset = 0;
  while ((offset = output.indexOf(sourceBytes, offset)) >= 0) {
    targetBytes.copy(output, offset);
    count += 1;
    offset += targetBytes.length;
  }
  return { buffer: output, count };
}

function rewriteComputerUseExecutableIdentity(executable) {
  let rewritten = Buffer.from(executable);
  const counts = {};
  for (const replacement of BINARY_REPLACEMENTS) {
    const result = replaceFixedWidth(rewritten, replacement.source, replacement.target);
    if (result.count !== replacement.expectedCount) {
      throw new Error(
        `Unexpected Open Computer Use ${COMPUTER_USE_UPSTREAM_IDENTITY.version} binary layout for `
        + `${replacement.source}: expected ${replacement.expectedCount}, found ${result.count}`,
      );
    }
    rewritten = result.buffer;
    counts[replacement.source] = result.count;
  }
  verifyComputerUseExecutableIdentity(rewritten);
  return { buffer: rewritten, counts };
}

function verifyComputerUseExecutableIdentity(executable) {
  for (const replacement of BINARY_REPLACEMENTS) {
    const remaining = countOccurrences(executable, replacement.source);
    if (remaining !== 0) {
      throw new Error(`Packaged Computer Use binary retains ${remaining} occurrence(s) of ${replacement.source}`);
    }
  }

  const expectations = [
    [COMPUTER_USE_PACKAGED_IDENTITY.developmentBundleIdentifier, [2]],
    // Includes the two development identifiers, which use this as a prefix.
    // codesign replaces the two original signature blobs, reducing this from
    // 10 occurrences before signing to 8 in the signed universal binary.
    [COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier, [8, 10]],
    [COMPUTER_USE_PACKAGED_IDENTITY.defaultAgentSocketName, [2]],
  ];
  for (const [value, allowed] of expectations) {
    const actual = countOccurrences(executable, value);
    if (!allowed.includes(actual)) {
      throw new Error(
        `Unexpected packaged Computer Use binary count for ${value}: expected ${allowed.join(" or ")}, found ${actual}`,
      );
    }
  }
}

async function applyComputerUsePackagedIdentity(
  appPath,
  execFileAsync,
  fileSystem = { readFile, writeFile },
) {
  const bundlePath = join(appPath, COMPUTER_USE_PACKAGED_IDENTITY.relativeBundlePath);
  const infoPath = join(bundlePath, "Contents", "Info.plist");
  const executablePath = join(
    bundlePath,
    "Contents",
    "MacOS",
    COMPUTER_USE_PACKAGED_IDENTITY.executableName,
  );
  const replacements = [
    ["CFBundleIdentifier", COMPUTER_USE_PACKAGED_IDENTITY.bundleIdentifier],
    ["CFBundleName", COMPUTER_USE_PACKAGED_IDENTITY.bundleName],
    ["CFBundleDisplayName", COMPUTER_USE_PACKAGED_IDENTITY.bundleName],
    ["OpenComputerUseAppVariant", COMPUTER_USE_PACKAGED_IDENTITY.bundleVariant],
  ];

  for (const [key, value] of replacements) {
    await execFileAsync("/usr/bin/plutil", ["-replace", key, "-string", value, infoPath]);
  }

  const executable = await fileSystem.readFile(executablePath);
  const rewritten = rewriteComputerUseExecutableIdentity(executable);
  await fileSystem.writeFile(executablePath, rewritten.buffer);

  return { bundlePath, infoPath, executablePath, binaryReplacementCounts: rewritten.counts };
}

module.exports = {
  BINARY_REPLACEMENTS,
  COMPUTER_USE_PACKAGED_IDENTITY,
  COMPUTER_USE_UPSTREAM_IDENTITY,
  applyComputerUsePackagedIdentity,
  countOccurrences,
  rewriteComputerUseExecutableIdentity,
  verifyComputerUseExecutableIdentity,
};
