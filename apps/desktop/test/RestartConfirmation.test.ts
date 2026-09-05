// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestartConfirmation } from "../../../plugins/desktop-chrome/src/client/RestartConfirmation.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy: Record<string, string> = {
  "restart.title": "重启 DeepDeck？",
  "restart.description": "DeepDeck 将短暂退出。",
  "restart.sessionsLabel": "会话",
  "restart.runningSessions": "正在运行",
  "restart.waitingSessions": "等待处理",
  "restart.sessionsHint": "重启后恢复原状态",
  "restart.appsLabel": "应用",
  "restart.openApps": "当前打开",
  "restart.appsHint": "重启后自动重新打开",
  "restart.durability": "排队消息不会丢失",
  "restart.cancel": "暂不重启",
  "restart.confirm": "确认重启",
  "restart.restarting": "正在重启…",
  "restart.failed": "提交失败",
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  container?.remove();
  root = undefined;
  container = undefined;
  Reflect.deleteProperty(window, "deepseekDesktop");
});

describe("RestartConfirmation", () => {
  it("waits for an explicit click and snapshots running Sessions at confirmation time", async () => {
    const decideRestart = vi.fn(async () => true);
    Object.defineProperty(window, "deepseekDesktop", {
      configurable: true,
      value: {
        runtime: {
          pendingRestart: vi.fn(async () => ({ requestId: "restart-1", openAppCount: 2 })),
          decideRestart,
          onRestartRequested: vi.fn(() => () => {}),
          restartRecovery: vi.fn(async () => undefined),
          acknowledgeRestartRecovery: vi.fn(async () => true),
        },
      },
    });
    const state = {
      byId: {
        running: { id: "running", running: true },
        waiting: { id: "waiting", running: true, pendingInteraction: "approval" },
        idle: { id: "idle", running: false },
        child: { id: "child", running: true, origin: "subagent" },
      },
    };
    const useSessions = (selector: (value: typeof state) => unknown) => selector(state);
    const t = (key: string) => copy[key] ?? key;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(RestartConfirmation, { useSessions, t } as never));
    });

    expect(container.textContent).toContain("排队消息不会丢失");
    expect(container.textContent).toContain("2 当前打开");
    expect(decideRestart).not.toHaveBeenCalled();

    const confirm = [...container.querySelectorAll("button")]
      .find(button => button.textContent === "确认重启");
    await act(async () => { confirm?.click(); });

    expect(decideRestart).toHaveBeenCalledWith({
      requestId: "restart-1",
      confirmed: true,
      sessions: [
        { sessionId: "running", continuation: true },
        { sessionId: "waiting", continuation: false },
      ],
    });
  });
});
