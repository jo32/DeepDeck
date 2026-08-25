import { describe, expect, it } from "vitest";
import { resolveDesktopRuntimePaths } from "./runtime-paths.js";

describe("resolveDesktopRuntimePaths", () => {
  it("uses workspace resources and development overrides when unpackaged", () => {
    const paths = resolveDesktopRuntimePaths({
      appPath: "/repo/apps/desktop",
      cwd: "/repo/workspace",
      environment: {
        DEEPSEEK_DESKTOP_NODE_BINARY: "/toolchain/node",
        DEEPDECK_HOME_HERO_PLUGIN: "/custom/home-hero",
      },
      home: "/Users/deepdeck",
      isPackaged: false,
      platform: "darwin",
      resourcesPath: "/ignored/resources",
    });

    expect(paths.brandingManifestPath).toBe("/repo/branding/brand.json");
    expect(paths.harnessRoot).toBe("/repo/vendor/deepseek-harness");
    expect(paths.nodeBinary).toBe("/toolchain/node");
    expect(paths.workspaceRoot).toBe("/repo/workspace");
    expect(paths.plugins[1]?.path).toBe("/custom/home-hero");
    expect(paths.plugins[7]?.path).toBe("/repo/plugins/computer-use");
    expect(paths.plugins[8]?.path).toBe("/repo/node_modules/dsh-codex-connect");
  });

  it("pins program resources inside the packaged bundle", () => {
    const paths = resolveDesktopRuntimePaths({
      appPath: "/Applications/DeepDeck.app/Contents/Resources/app.asar",
      cwd: "/tmp/source",
      environment: {
        DEEPSEEK_HARNESS_PATH: "/tmp/untrusted-harness",
        DEEPSEEK_DESKTOP_NODE_BINARY: "/usr/local/bin/node",
      },
      home: "/Users/deepdeck",
      isPackaged: true,
      platform: "darwin",
      resourcesPath: "/Applications/DeepDeck.app/Contents/Resources",
    });

    expect(paths).toMatchObject({
      brandingManifestPath:
        "/Applications/DeepDeck.app/Contents/Resources/branding/brand.json",
      harnessRoot: "/Applications/DeepDeck.app/Contents/Resources/harness",
      nodeBinary: "/Applications/DeepDeck.app/Contents/Resources/runtime/node/bin/node",
      patchPath: "/Applications/DeepDeck.app/Contents/Resources/cordis.patch.yml",
      workspaceRoot: "/Users/deepdeck",
    });
    expect(paths.plugins.map((plugin) => plugin.path)).toEqual([
      "/Applications/DeepDeck.app/Contents/Resources/plugins/desktop-chrome",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/home-hero",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/agent-preset-sections",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/marketplace-desktop-bridge",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/bun-plugin-builder",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/first-run",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/app-conversations",
      "/Applications/DeepDeck.app/Contents/Resources/plugins/computer-use",
      "/Applications/DeepDeck.app/Contents/Resources/harness/node_modules/dsh-codex-connect",
      "/Applications/DeepDeck.app/Contents/Resources/harness/node_modules/dsh-community-market",
    ]);
    expect(paths.plugins.slice(-2).map((plugin) => ({
      packageName: plugin.packageName,
      presetBundle: plugin.presetBundle,
    }))).toEqual([
      { packageName: "dsh-codex-connect", presetBundle: true },
      { packageName: "dsh-community-market", presetBundle: true },
    ]);
  });

  it("uses the packaged Windows executable and honors only the workspace override", () => {
    const paths = resolveDesktopRuntimePaths({
      appPath: "C:\\Program Files\\DeepDeck\\resources\\app.asar",
      cwd: "C:\\source",
      environment: { DEEPSEEK_DESKTOP_WORKSPACE: "D:\\Projects" },
      home: "C:\\Users\\DeepDeck",
      isPackaged: true,
      platform: "win32",
      resourcesPath: "C:\\Program Files\\DeepDeck\\resources",
    });

    expect(paths.nodeBinary).toMatch(/resources[\\/]runtime[\\/]node[\\/]node\.exe$/);
    expect(paths.workspaceRoot).toBe("D:\\Projects");
  });
});
