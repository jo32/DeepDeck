import { readFileSync } from "node:fs";
import { join } from "node:path";

interface DesktopPackageMetadata {
  deepdeckLocalBuild?: unknown;
}

/** Read the immutable marker embedded by electron-builder in local packages. */
export function isLocalDesktopPackage(appPath: string): boolean {
  try {
    const metadata = JSON.parse(
      readFileSync(join(appPath, "package.json"), "utf8"),
    ) as DesktopPackageMetadata;
    return metadata.deepdeckLocalBuild === true;
  } catch {
    return false;
  }
}
