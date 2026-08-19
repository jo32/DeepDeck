import { mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST,
  COMMUNITY_MARKET_RESTART_REQUEST,
  ensureHarnessPluginLink,
  isCommunityMarketOpenTerminalRequest,
  isMarketplaceRestartRequest,
  resolveCommunityMarketTerminalLaunch,
  resolveHarnessHome,
  resolveHarnessPluginLink,
  restoreHarnessPluginLink,
} from "./harness-process.js";

describe("Harness plugin resolution", () => {
  it("recognizes Community Market desktop requests and resolves native terminals safely", () => {
    expect(isMarketplaceRestartRequest({ type: COMMUNITY_MARKET_RESTART_REQUEST })).toBe(true);
    expect(isCommunityMarketOpenTerminalRequest({
      type: COMMUNITY_MARKET_OPEN_TERMINAL_REQUEST,
    })).toBe(true);
    expect(isCommunityMarketOpenTerminalRequest({
      type: COMMUNITY_MARKET_RESTART_REQUEST,
    })).toBe(false);
    expect(resolveCommunityMarketTerminalLaunch("darwin", "/tmp/dsh profile")).toEqual({
      command: "/usr/bin/open",
      args: ["-a", "Terminal", "/tmp/dsh profile"],
    });
    expect(resolveCommunityMarketTerminalLaunch("win32", "C:\\Users\\DeepDeck\\.dsh")).toEqual({
      command: "powershell.exe",
      args: [
        "-NoExit",
        "-Command",
        "Set-Location -LiteralPath $args[0]",
        "C:\\Users\\DeepDeck\\.dsh",
      ],
    });
  });

  it("matches Harness home precedence and expands a home-relative override", () => {
    expect(resolveHarnessHome({})).toBe(join(homedir(), ".dsh"));
    expect(resolveHarnessHome({ DSH_HOME: "  " })).toBe(join(homedir(), ".dsh"));
    expect(resolveHarnessHome({ DSH_HOME: "~/custom-dsh" })).toBe(join(homedir(), "custom-dsh"));
    expect(resolveHarnessHome({ DSH_HOME: "./custom-dsh" })).toBe(resolve("./custom-dsh"));
  });

  it("places scoped packages where the web profile and browser scanner resolve them", () => {
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@deepdeck/dsh-client-ui-agent-preset-sections",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@deepdeck/dsh-client-ui-agent-preset-sections",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@deepdeck/dsh-client-ui-desktop-chrome",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@deepdeck/dsh-client-ui-desktop-chrome",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@deepdeck/dsh-client-ui-home-hero",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@deepdeck/dsh-client-ui-home-hero",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@deepdeck/dsh-community-market-desktop-bridge",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@deepdeck/dsh-community-market-desktop-bridge",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@deepdeck/dsh-first-run",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@deepdeck/dsh-first-run",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "dsh-community-market",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/dsh-community-market",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "dsh-codex-connect",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/dsh-codex-connect",
    );
  });

  it("rejects package paths that could escape node_modules", () => {
    expect(() => resolveHarnessPluginLink("/tmp/dsh-home", "../outside")).toThrow(
      "无效的插件包名",
    );
  });

  it("lets packaged and development launches replace their own stale plugin links", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepdeck-plugin-link-"));
    const oldPlugin = join(root, "old-plugin");
    const newPlugin = join(root, "new-plugin");
    const dshHome = join(root, "dsh-home");
    const link = resolveHarnessPluginLink(
      dshHome,
      "@deepdeck/dsh-client-ui-desktop-chrome",
    );
    mkdirSync(oldPlugin, { recursive: true });
    mkdirSync(newPlugin, { recursive: true });
    mkdirSync(join(link, ".."), { recursive: true });
    symlinkSync(oldPlugin, link, "junction");

    const ownership = ensureHarnessPluginLink(link, newPlugin);
    expect(ownership).toEqual({ pluginRoot: newPlugin, previousTarget: oldPlugin });
    expect(resolve(join(link, ".."), readlinkSync(link))).toBe(newPlugin);

    restoreHarnessPluginLink(link, ownership!);
    expect(resolve(join(link, ".."), readlinkSync(link))).toBe(oldPlugin);

    await rm(root, { recursive: true, force: true });
  });
});
