import type { HarnessRuntimeStatus } from "../shared/runtime.js";

export function runtimeStatusDuringUpdate(
  status: HarnessRuntimeStatus,
  displayName: string,
  installingVersion?: string,
): HarnessRuntimeStatus {
  if (!installingVersion) return status;
  return {
    state: "starting",
    message: `正在安装 ${displayName} v${installingVersion}…`,
  };
}
