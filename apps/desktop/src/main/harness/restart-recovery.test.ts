import { describe, expect, it } from "vitest";
import { HarnessRestartRecovery } from "./restart-recovery.js";

describe("HarnessRestartRecovery", () => {
  it("does not start recovery until the user explicitly confirms", () => {
    const state = new HarnessRestartRecovery(() => "restart-1");
    const request = state.request(["/apps/music"]);

    expect(request).toEqual({ requestId: "restart-1", openAppCount: 1 });
    expect(state.recovery()).toBeUndefined();
    expect(state.decide({ requestId: "restart-1", confirmed: false, sessions: [] })).toBe("cancelled");
    expect(state.recovery()).toBeUndefined();
  });

  it("retains app routes and only clears acknowledged Session recovery", () => {
    const state = new HarnessRestartRecovery(() => "restart-2");
    state.request(["/apps/music?project=one"]);

    expect(state.decide({
      requestId: "restart-2",
      confirmed: true,
      sessions: [
        { sessionId: "session-running", continuation: true },
        { sessionId: "session-waiting", continuation: false },
      ],
    })).toBe("confirmed");
    expect(state.appRoutes()).toEqual(["/apps/music?project=one"]);

    expect(state.acknowledge("restart-2", ["session-running"])).toBe(true);
    expect(state.recovery()?.sessions).toEqual([
      { sessionId: "session-waiting", continuation: false },
    ]);
    state.markAppsRestored();
    expect(state.recovery()).toBeDefined();
    expect(state.acknowledge("restart-2", ["session-waiting"])).toBe(true);
    expect(state.recovery()).toBeUndefined();
  });

  it("rejects duplicate or malformed Session snapshots", () => {
    const state = new HarnessRestartRecovery(() => "restart-3");
    state.request([]);
    expect(state.decide({
      requestId: "restart-3",
      confirmed: true,
      sessions: [
        { sessionId: "same", continuation: true },
        { sessionId: "same", continuation: false },
      ],
    })).toBe("ignored");
    expect(state.pendingRequest()?.requestId).toBe("restart-3");
  });
});
