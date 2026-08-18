import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const relaunchScript = String.raw`
parent_pid="$1"
app_path="$2"
target_version="$3"

while kill -0 "$parent_pid" 2>/dev/null; do
  sleep 0.25
done

attempt=0
while [ "$attempt" -lt 480 ]; do
  installed_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist" 2>/dev/null || true)
  if [ "$installed_version" = "$target_version" ]; then
    sleep 1
    /usr/bin/open "$app_path"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 0.25
done

# Do not strand the user if ShipIt fails. Reopen the surviving bundle so the
# application can report the update again instead of appearing permanently gone.
/usr/bin/open "$app_path"
`;

export interface UpdateRelaunchOptions {
  appPath: string;
  currentPid: number;
  targetVersion: string;
  spawnProcess?: typeof spawn;
}

export function resolveMacAppPath(executablePath: string): string {
  return path.resolve(path.dirname(executablePath), "../..");
}

export function armMacUpdateRelaunch({
  appPath,
  currentPid,
  targetVersion,
  spawnProcess = spawn,
}: UpdateRelaunchOptions): ChildProcess {
  const child = spawnProcess(
    "/bin/sh",
    ["-c", relaunchScript, "deepdeck-update-relauncher", String(currentPid), appPath, targetVersion],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return child;
}
