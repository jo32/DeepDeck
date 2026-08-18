export function shouldForceExitForUpdate(
  quitReady: boolean,
  installingUpdateVersion?: string,
): boolean {
  return quitReady && Boolean(installingUpdateVersion);
}
