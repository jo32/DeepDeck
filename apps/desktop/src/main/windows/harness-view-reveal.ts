export interface HarnessViewRevealDriver {
  /** Keep the splash visible while allowing Harness to build a compositor frame. */
  stage(): void;
  /** Resolve only after Chromium can return the current Harness frame. */
  capture(): Promise<void>;
  /** Promote the already-captured Harness frame above the splash. */
  reveal(): void;
  /** Restore the splash and stop presenting Harness. */
  conceal(): void;
}

type RevealState = "concealed" | "staging" | "revealed";

/**
 * Serializes the native splash-to-Harness handoff.
 *
 * React readiness alone is insufficient: a hidden WebContentsView can retain
 * an older compositor frame. Staging makes the view drawable behind the
 * splash; capturePage then provides the native acknowledgement that the
 * current frame exists before it is promoted.
 */
export class HarnessViewReveal {
  private generation = 0;
  private state: RevealState = "concealed";

  constructor(private readonly driver: HarnessViewRevealDriver) {}

  request(): void {
    if (this.state !== "concealed") return;
    this.state = "staging";
    const generation = this.generation;
    this.driver.stage();
    void this.driver.capture()
      // Capture failure must not strand the app on its splash forever. The
      // normal path remains capture-gated; this is only a fail-open fallback.
      .catch(() => {})
      .then(() => {
        if (generation !== this.generation || this.state !== "staging") return;
        this.state = "revealed";
        this.driver.reveal();
      });
  }

  conceal(): void {
    this.generation += 1;
    this.state = "concealed";
    this.driver.conceal();
  }
}
