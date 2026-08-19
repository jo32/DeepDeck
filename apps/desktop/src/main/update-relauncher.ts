import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export interface UpdateHelperOptions {
  helperPath: string;
  appPath: string;
  statePath: string;
  currentPid: number;
  sourceVersion: string;
  targetVersion: string;
  displayName: string;
  locale: string;
  skipSecurityVerification?: boolean;
  spawnProcess?: typeof spawn;
}

export function resolveMacAppPath(executablePath: string): string {
  return path.resolve(path.dirname(executablePath), "../..");
}

export function resolveMacUpdateHelperPath(resourcesPath: string): string {
  return path.join(resourcesPath, "deepdeck-update-helper");
}

export function launchMacUpdateHelper({
  helperPath,
  appPath,
  statePath,
  currentPid,
  sourceVersion,
  targetVersion,
  displayName,
  locale,
  skipSecurityVerification = false,
  spawnProcess = spawn,
}: UpdateHelperOptions): Promise<ChildProcess> {
  const arguments_ = [
    "--parent-pid", String(currentPid),
    "--app-path", appPath,
    "--state-path", statePath,
    "--source-version", sourceVersion,
    "--target-version", targetVersion,
    "--display-name", displayName,
    "--locale", locale,
    ...(skipSecurityVerification ? ["--skip-security-verification"] : []),
  ];
  const child = spawnProcess(helperPath, arguments_, { detached: true, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      child.removeListener("spawn", onSpawn);
      reject(error);
    };
    const onSpawn = (): void => {
      child.removeListener("error", onError);
      child.unref();
      resolve(child);
    };
    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
}
