import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migratePresetBundles } from "./preset-profile.js";

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
