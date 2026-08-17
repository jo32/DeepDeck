import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHarnessHome, resolveHarnessPluginLink } from "./harness-process.js";

describe("Harness plugin resolution", () => {
  it("matches Harness home precedence and expands a home-relative override", () => {
    expect(resolveHarnessHome({})).toBe(join(homedir(), ".dsh"));
    expect(resolveHarnessHome({ DSH_HOME: "  " })).toBe(join(homedir(), ".dsh"));
    expect(resolveHarnessHome({ DSH_HOME: "~/custom-dsh" })).toBe(join(homedir(), "custom-dsh"));
    expect(resolveHarnessHome({ DSH_HOME: "./custom-dsh" })).toBe(resolve("./custom-dsh"));
  });

  it("places scoped packages where the web profile and browser scanner resolve them", () => {
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@openworkbuddy/dsh-client-ui-agent-preset-sections",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@openworkbuddy/dsh-client-ui-agent-preset-sections",
    );
    expect(resolveHarnessPluginLink(
      "/tmp/dsh-home",
      "@openworkbuddy/dsh-client-ui-desktop-chrome",
    )).toBe(
      "/tmp/dsh-home/profiles/web/node_modules/@openworkbuddy/dsh-client-ui-desktop-chrome",
    );
  });

  it("rejects package paths that could escape node_modules", () => {
    expect(() => resolveHarnessPluginLink("/tmp/dsh-home", "../outside")).toThrow(
      "无效的插件包名",
    );
  });
});
