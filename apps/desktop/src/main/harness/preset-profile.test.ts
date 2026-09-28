import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESKTOP_BUNDLE, ensureDesktopBundle, migratePresetBundles } from "./preset-profile.js";

it("adds desktop defaults once while preserving user bundles and a recoverable manifest", async () => {
  const home = await mkdtemp(join(tmpdir(), "deepdeck-bundle-"));
  try {
    const directory = join(home, "profiles", "web");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "package.json");
    const original = { private: true, dependencies: { custom: "1" }, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "custom"] } } };
    writeFileSync(path, JSON.stringify(original));
    ensureDesktopBundle(home);
    ensureDesktopBundle(home);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ ...original, dsh: { profile: { bundles: [...original.dsh.profile.bundles, DESKTOP_BUNDLE] } } });
    expect(JSON.parse(readFileSync(`${path}.deepdeck-before-bundle`, "utf8"))).toEqual(original);
  } finally { await rm(home, { recursive: true, force: true }); }
});

it("initializes a fresh profile with the base and web bundles before desktop defaults", async () => {
  const home = await mkdtemp(join(tmpdir(), "deepdeck-bundle-"));
  try {
    ensureDesktopBundle(home);
    const manifest = JSON.parse(readFileSync(join(home, "profiles/web/package.json"), "utf8"));
    expect(manifest.dsh.profile.bundles).toEqual(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", DESKTOP_BUNDLE]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

describe("preset profile migration", () => {
  it("retires a Marketplace bundle while preserving a one-time manifest backup", async () => {
    const dshHome = await mkdtemp(join(tmpdir(), "deepdeck-preset-profile-"));
    const profile = join(dshHome, "profiles", "web");
    const manifestPath = join(profile, "package.json");
    mkdirSync(profile, { recursive: true });
    const original = {
      dependencies: {
        "dsh-codex-connect": "0.1.0-alpha.4.8",
        dshmarket: "1.13.0",
        other: "1.0.0",
      },
      dsh: {
        profile: {
          bundles: ["@deepseek-ai/dsh-web-app", "dsh-codex-connect", "dshmarket"],
        },
      },
    };
    writeFileSync(manifestPath, `${JSON.stringify(original, null, 2)}\n`);

    const result = migratePresetBundles(dshHome, ["dsh-codex-connect", "dshmarket"]);
    expect(result.removed).toEqual(["dsh-codex-connect", "dshmarket"]);
    expect(result.retiredPaths).toEqual([]);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      dependencies: { other: "1.0.0" },
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-web-app"] } },
    });
    expect(JSON.parse(readFileSync(result.backupPath!, "utf8"))).toEqual(original);
    const installedPath = join(profile, "node_modules", "dsh-codex-connect");
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(join(installedPath, "package.json"), "{}\n");
    const retired = migratePresetBundles(dshHome, ["dsh-codex-connect"]);
    expect(retired.removed).toEqual([]);
    expect(retired.retiredPaths).toEqual([`${installedPath}.deepdeck-retired`]);

    await rm(dshHome, { recursive: true, force: true });
  });
});
