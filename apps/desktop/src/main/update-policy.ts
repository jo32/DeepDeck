export function shouldEnableDesktopUpdates(
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return isPackaged && environment.DEEPDECK_LOCAL_BUILD?.trim() !== "1";
}
