import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  COMPUTER_USE_PACKAGED_IDENTITY,
  applyComputerUsePackagedIdentity,
} = require("../build/computer-use-identity.cjs") as {
  COMPUTER_USE_PACKAGED_IDENTITY: {
    bundleIdentifier: string;
    bundleName: string;
    bundleVariant: string;
    executableName: string;
    relativeBundlePath: string;
  };
  applyComputerUsePackagedIdentity: (
    appPath: string,
    execFileAsync: (command: string, args: string[]) => Promise<unknown>,
  ) => Promise<{ bundlePath: string; infoPath: string }>;
};

describe("packaged Computer Use identity", () => {
  it("uses the upstream-supported development identifier for the DeepDeck-signed helper", async () => {
    const execFileAsync = vi.fn(async () => ({}));
    const appPath = "/tmp/package/DeepDeck.app";

    const result = await applyComputerUsePackagedIdentity(appPath, execFileAsync);

    const bundlePath = join(appPath, COMPUTER_USE_PACKAGED_IDENTITY.relativeBundlePath);
    const infoPath = join(bundlePath, "Contents", "Info.plist");
    expect(result).toEqual({ bundlePath, infoPath });
    expect(COMPUTER_USE_PACKAGED_IDENTITY).toMatchObject({
      bundleIdentifier: "com.ifuryst.opencomputeruse.dev",
      bundleName: "DeepDeck Computer Use",
      bundleVariant: "dev",
      executableName: "OpenComputerUse",
    });
    expect(execFileAsync.mock.calls).toEqual([
      ["/usr/bin/plutil", ["-replace", "CFBundleIdentifier", "-string", "com.ifuryst.opencomputeruse.dev", infoPath]],
      ["/usr/bin/plutil", ["-replace", "CFBundleName", "-string", "DeepDeck Computer Use", infoPath]],
      ["/usr/bin/plutil", ["-replace", "CFBundleDisplayName", "-string", "DeepDeck Computer Use", infoPath]],
      ["/usr/bin/plutil", ["-replace", "OpenComputerUseAppVariant", "-string", "dev", infoPath]],
    ]);
  });
});
