import { describe, expect, it } from "vitest";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";
import { runtimeStatusDuringUpdate } from "./update-installation-status.js";

describe("runtimeStatusDuringUpdate", () => {
  it("replaces a stopped runtime message while an update is installing", () => {
    expect(runtimeStatusDuringUpdate(
      { state: "idle", message: "DeepDeck 已停止" },
      "DeepDeck",
      "1.0.4",
    )).toEqual({
      state: "starting",
      message: "正在安装 DeepDeck v1.0.4…",
    });
  });

  it("preserves the runtime status outside an update", () => {
    const status: HarnessRuntimeStatus = {
      state: "ready",
      message: "DeepDeck 已就绪",
      url: "http://127.0.0.1:3210",
    };
    expect(runtimeStatusDuringUpdate(status, "DeepDeck")).toBe(status);
  });
});
