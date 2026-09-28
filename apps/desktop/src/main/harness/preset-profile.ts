import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

type ProfileManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  dsh?: { profile?: { bundles?: unknown } };
};

export const DESKTOP_BUNDLE = "@deepdeck/dsh-client-ui-desktop-chrome";

/** Install defaults below the user's patch layer so volatile settings remain writable. */
export function ensureDesktopBundle(dshHome: string): void {
  const profile = join(dshHome, "profiles", "web");
  const path = join(profile, "package.json");
  mkdirSync(profile, { recursive: true });
  const source = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  const manifest: ProfileManifest = source === undefined ? {} : JSON.parse(source);
  const bundles = manifest.dsh?.profile?.bundles;
  if (bundles !== undefined && (!Array.isArray(bundles) || bundles.some(value => typeof value !== "string"))) {
    throw new Error("Web profile bundles must be a list of package names");
  }
  if (Array.isArray(bundles) && bundles.includes(DESKTOP_BUNDLE)) return;
  manifest.dsh ??= {};
  manifest.dsh.profile ??= {};
  manifest.dsh.profile.bundles = [...(bundles as string[] | undefined ?? ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]), DESKTOP_BUNDLE];
  if (source !== undefined && !existsSync(`${path}.deepdeck-before-bundle`)) copyFileSync(path, `${path}.deepdeck-before-bundle`);
  const temporary = `${path}.deepdeck-${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export interface PresetBundleMigration {
  backupPath?: string;
  removed: string[];
  retiredPaths: string[];
}

/**
 * Retire profile-owned copies of packages that became DeepDeck presets.
 * The original manifest is backed up once and an installed package directory
 * is renamed rather than deleted, so migration stays recoverable without
 * copying or reading OAuth material.
 */
export function migratePresetBundles(
  dshHome: string,
  packageNames: readonly string[],
): PresetBundleMigration {
  if (packageNames.length === 0) return { removed: [], retiredPaths: [] };
  const manifestPath = join(dshHome, "profiles", "web", "package.json");
  if (!existsSync(manifestPath)) return { removed: [], retiredPaths: [] };

  const source = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(source) as ProfileManifest;
  const removed = new Set<string>();
  const packageSet = new Set(packageNames);

  for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const dependencies = manifest[field];
    if (!dependencies) continue;
    for (const packageName of packageNames) {
      if (!(packageName in dependencies)) continue;
      delete dependencies[packageName];
      removed.add(packageName);
    }
  }

  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    const retained = bundles.filter((bundle) => {
      if (typeof bundle !== "string" || !packageSet.has(bundle)) return true;
      removed.add(bundle);
      return false;
    });
    manifest.dsh!.profile!.bundles = retained;
  }

  let backupPath: string | undefined;
  if (removed.size > 0) {
    backupPath = `${manifestPath}.deepdeck-before-presets`;
    if (!existsSync(backupPath)) copyFileSync(manifestPath, backupPath);
    const temporaryPath = `${manifestPath}.deepdeck-${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, manifestPath);
  }

  const retiredPaths: string[] = [];
  const profileModules = join(dshHome, "profiles", "web", "node_modules");
  for (const packageName of packageNames) {
    const packagePath = join(profileModules, ...packageName.split("/"));
    if (!existsSync(packagePath)) continue;
    if (lstatSync(packagePath).isSymbolicLink()) continue;
    let retiredPath = `${packagePath}.deepdeck-retired`;
    let suffix = 2;
    while (existsSync(retiredPath)) {
      retiredPath = `${packagePath}.deepdeck-retired-${suffix}`;
      suffix += 1;
    }
    renameSync(packagePath, retiredPath);
    retiredPaths.push(retiredPath);
  }

  return {
    ...(backupPath ? { backupPath } : {}),
    removed: [...removed].sort(),
    retiredPaths,
  };
}
