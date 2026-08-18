import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isLocalDesktopPackage } from "./package-metadata.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe("desktop package metadata", () => {
  it("recognizes only an explicit embedded local-build marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepdeck-package-metadata-"));
    temporaryDirectories.push(root);
    const local = join(root, "local");
    const production = join(root, "production");
    await mkdir(local);
    await mkdir(production);
    await writeFile(join(local, "package.json"), JSON.stringify({ deepdeckLocalBuild: true }));
    await writeFile(join(production, "package.json"), JSON.stringify({ version: "1.0.2" }));

    expect(isLocalDesktopPackage(local)).toBe(true);
    expect(isLocalDesktopPackage(production)).toBe(false);
    expect(isLocalDesktopPackage(join(root, "missing"))).toBe(false);
  });
});
