import type { DesktopUpdateStatus } from "../shared/update.js";

export interface InstallableDesktopUpdate {
  quitAndInstall(): void;
}

export function createUpdateInstaller(
  updates: InstallableDesktopUpdate,
  prepareToQuit: () => Promise<void>,
  beforeInstall: (status: DesktopUpdateStatus) => void | Promise<void> = () => {},
): (status: DesktopUpdateStatus) => Promise<void> {
  let installPromise: Promise<void> | undefined;

  return (status) => {
    if (status.state !== "downloaded") return Promise.resolve();
    if (!installPromise) {
      const attempt = Promise.resolve(beforeInstall(status))
        .then(prepareToQuit)
        .then(() => {
          updates.quitAndInstall();
        });
      installPromise = attempt.catch((error: unknown) => {
        installPromise = undefined;
        throw error;
      });
    }
    return installPromise;
  };
}
