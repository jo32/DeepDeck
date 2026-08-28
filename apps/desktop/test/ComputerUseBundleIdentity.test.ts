import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  BINARY_REPLACEMENTS,
  COMPUTER_USE_PACKAGED_IDENTITY,
  COMPUTER_USE_UPSTREAM_IDENTITY,
  applyComputerUsePackagedIdentity,
  countOccurrences,
  rewriteComputerUseExecutableIdentity,
} = require("../build/computer-use-identity.cjs") as {
  BINARY_REPLACEMENTS: ReadonlyArray<{ source: string; target: string; expectedCount: number }>;
  COMPUTER_USE_PACKAGED_IDENTITY: {
    bundleIdentifier: string;
    developmentBundleIdentifier: string;
    bundleName: string;
    bundleVariant: string;
    defaultAgentSocketName: string;
    executableName: string;
    relativeBundlePath: string;
  };
  COMPUTER_USE_UPSTREAM_IDENTITY: {
    bundleIdentifier: string;
    developmentBundleIdentifier: string;
    defaultAgentSocketName: string;
    version: string;
  };
  applyComputerUsePackagedIdentity: (
    appPath: string,
    execFileAsync: (command: string, args: string[]) => Promise<unknown>,
    fileSystem: {
      readFile: (path: string) => Promise<Buffer>;
      writeFile: (path: string, contents: Buffer) => Promise<void>;
    },
  ) => Promise<{
    bundlePath: string;
    infoPath: string;
    executablePath: string;
    binaryReplacementCounts: Record<string, number>;
  }>;
  countOccurrences: (buffer: Buffer, value: string) => number;
  rewriteComputerUseExecutableIdentity: (buffer: Buffer) => {
    buffer: Buffer;
    counts: Record<string, number>;
  };
};

function upstreamFixture(): Buffer {
  return Buffer.from([
    ...Array.from({ length: 2 }, () => COMPUTER_USE_UPSTREAM_IDENTITY.developmentBundleIdentifier),
    ...Array.from({ length: 8 }, () => COMPUTER_USE_UPSTREAM_IDENTITY.bundleIdentifier),
    ...Array.from({ length: 2 }, () => COMPUTER_USE_UPSTREAM_IDENTITY.defaultAgentSocketName),
  ].join("\0"));
}

describe("packaged Computer Use identity", () => {
  it("uses a fixed-width DeepDeck-owned identity", () => {
    expect(COMPUTER_USE_PACKAGED_IDENTITY).toMatchObject({
      bundleIdentifier: "com.jo32.deepdeck.cu-helper",
      developmentBundleIdentifier: "com.jo32.deepdeck.cu-helper.dev",
      bundleName: "DeepDeck Computer Use",
      bundleVariant: "release",
      defaultAgentSocketName: "deepdeck-computer-agent.sock",
      executableName: "OpenComputerUse",
    });
    for (const replacement of BINARY_REPLACEMENTS) {
      expect(Buffer.byteLength(replacement.target)).toBe(Buffer.byteLength(replacement.source));
    }
  });

  it("rewrites every audited native identity constant and rejects drift", () => {
    const rewritten = rewriteComputerUseExecutableIdentity(upstreamFixture());

    expect(rewritten.counts).toEqual(Object.fromEntries(
      BINARY_REPLACEMENTS.map(({ source, expectedCount }) => [source, expectedCount]),
    ));
    for (const { source } of BINARY_REPLACEMENTS) {
      expect(countOccurrences(rewritten.buffer, source)).toBe(0);
    }
    expect(() => rewriteComputerUseExecutableIdentity(Buffer.from("unexpected upstream"))).toThrow(
      `Unexpected Open Computer Use ${COMPUTER_USE_UPSTREAM_IDENTITY.version} binary layout`,
    );
  });

  it("rewrites the plist and executable before signing", async () => {
    const execFileAsync = vi.fn(async () => ({}));
    const readFile = vi.fn(async () => upstreamFixture());
    const writeFile = vi.fn(async () => {});
    const appPath = "/tmp/package/DeepDeck.app";

    const result = await applyComputerUsePackagedIdentity(
      appPath,
      execFileAsync,
      { readFile, writeFile },
    );

    const bundlePath = join(appPath, COMPUTER_USE_PACKAGED_IDENTITY.relativeBundlePath);
    const infoPath = join(bundlePath, "Contents", "Info.plist");
    const executablePath = join(bundlePath, "Contents", "MacOS", "OpenComputerUse");
    expect(result).toMatchObject({ bundlePath, infoPath, executablePath });
    expect(execFileAsync.mock.calls).toEqual([
      ["/usr/bin/plutil", ["-replace", "CFBundleIdentifier", "-string", "com.jo32.deepdeck.cu-helper", infoPath]],
      ["/usr/bin/plutil", ["-replace", "CFBundleName", "-string", "DeepDeck Computer Use", infoPath]],
      ["/usr/bin/plutil", ["-replace", "CFBundleDisplayName", "-string", "DeepDeck Computer Use", infoPath]],
      ["/usr/bin/plutil", ["-replace", "OpenComputerUseAppVariant", "-string", "release", infoPath]],
    ]);
    expect(readFile).toHaveBeenCalledWith(executablePath);
    expect(writeFile).toHaveBeenCalledWith(executablePath, expect.any(Buffer));
  });
});
