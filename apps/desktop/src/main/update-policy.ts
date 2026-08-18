export function shouldEnableDesktopUpdates(
  isPackaged: boolean,
  isLocalPackage: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return isPackaged
    && !isLocalPackage
    && environment.DEEPDECK_LOCAL_BUILD?.trim() !== "1";
}
