import type { DesktopUpdateStatus } from "../shared/update.js";

export interface InstallableDesktopUpdate {
  quitAndInstall(): void;
}

export function createAutomaticUpdateInstaller(
  updates: InstallableDesktopUpdate,
  prepareToQuit: () => Promise<void>,
): (status: DesktopUpdateStatus) => Promise<void> {
  let installPromise: Promise<void> | undefined;

  return (status) => {
    if (status.state !== "downloaded") return Promise.resolve();
    installPromise ??= prepareToQuit().then(() => {
      updates.quitAndInstall();
    });
    return installPromise;
  };
}
