import { describe, expect, it } from "vitest";
import { HarnessViewGate } from "./harness-view-gate.js";

describe("HarnessViewGate", () => {
  it("waits for the document and desktop frame in either order", () => {
    const gate = new HarnessViewGate();
    gate.begin("http://127.0.0.1:3210");

    expect(gate.finishDocument("http://127.0.0.1:3210/")).toBe(false);
    expect(gate.markClientReady("http://127.0.0.1:3210/session/new")).toBe(true);

    expect(gate.beginDocument("http://127.0.0.1:3210/")).toBe(true);
    expect(gate.markClientReady("http://127.0.0.1:3210/")).toBe(false);
    expect(gate.finishDocument("http://127.0.0.1:3210/")).toBe(true);
  });

  it("rejects stale, foreign, and suspended readiness signals", () => {
    const gate = new HarnessViewGate();
    gate.begin("http://127.0.0.1:3210");

    expect(gate.finishDocument("http://127.0.0.1:9999/")).toBe(false);
    expect(gate.markClientReady("http://127.0.0.1:9999/")).toBe(false);

    gate.suspend();
    expect(gate.finishDocument("http://127.0.0.1:3210/")).toBe(false);
    expect(gate.markClientReady("http://127.0.0.1:3210/")).toBe(false);
    expect(gate.allows("http://127.0.0.1:3210/another-path")).toBe(true);
  });
});
