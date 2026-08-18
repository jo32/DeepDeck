import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readThemeSource, themeSourceFromSettings } from "./theme-preference.js";

const temporaryHomes: string[] = [];

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "deepdeck-theme-"));
  temporaryHomes.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, {
    recursive: true,
    force: true,
  })));
});

describe("desktop splash theme preference", () => {
  it.each(["light", "dark", "system"] as const)(
    "accepts the Harness %s preference",
    (preference) => {
      expect(themeSourceFromSettings({
        "ui-theme": { preference },
      })).toBe(preference);
    },
  );

  it("falls back to the system theme for absent or invalid settings", () => {
    expect(themeSourceFromSettings(undefined)).toBe("system");
    expect(themeSourceFromSettings({ "ui-theme": { preference: "sepia" } })).toBe("system");
  });

  it("reads the same settings document Harness owns", async () => {
    const home = await temporaryHome();
    await writeFile(
      join(home, "settings.yaml"),
      "ui-theme:\n  preference: dark\n",
      "utf8",
    );

    await expect(readThemeSource(home)).resolves.toBe("dark");
  });

  it("keeps startup usable when the settings document is missing or malformed", async () => {
    const missingHome = await temporaryHome();
    await expect(readThemeSource(missingHome)).resolves.toBe("system");

    const malformedHome = await temporaryHome();
    await writeFile(join(malformedHome, "settings.yaml"), "ui-theme: [", "utf8");
    await expect(readThemeSource(malformedHome)).resolves.toBe("system");
  });
});
