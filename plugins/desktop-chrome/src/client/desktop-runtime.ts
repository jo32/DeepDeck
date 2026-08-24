interface DesktopRuntimeBridge {
  readyForDisplay?: () => void
}

/** Notify the Electron host after the real plugin-owned frame has mounted. */
export function notifyDesktopFrameReady(): void {
  const desktopGlobal = globalThis as typeof globalThis & {
    deepseekDesktop?: { runtime?: DesktopRuntimeBridge }
  }
  desktopGlobal.deepseekDesktop?.runtime?.readyForDisplay?.()
}

type ScheduleTask = (callback: () => void, delayMs: number) => number
type CancelTask = (handle: number) => void

export const DESKTOP_FRAME_MOTION_RESUME_MS = 400

/**
 * Reveal the already-committed static layout, then keep panel motion disabled
 * through the first visible compositor settle. Electron pauses animation
 * frames for hidden views, so the grace period begins when readiness is sent.
 */
export function scheduleDesktopFrameReveal(
  enableLayoutMotion: () => void,
  notifyReady: () => void = notifyDesktopFrameReady,
  scheduleTask: ScheduleTask = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelTask: CancelTask = clearTimeout,
): () => void {
  notifyReady()
  const motionTask = scheduleTask(() => {
    enableLayoutMotion()
    // A Harness restart can commit its new navigation immediately after the
    // first IPC signal and reset the native display gate. Repeating the
    // idempotent signal at the already-required compositor settle point closes
    // that race without delaying a normal first reveal.
    notifyReady()
  }, DESKTOP_FRAME_MOTION_RESUME_MS)
  return () => { cancelTask(motionTask) }
}
