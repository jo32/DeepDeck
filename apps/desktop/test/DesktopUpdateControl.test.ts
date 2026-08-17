// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopUpdateControl } from "../../../plugins/desktop-chrome/src/client/DesktopUpdateControl.tsx";

type UpdateStatus = Awaited<ReturnType<NonNullable<Window["deepseekDesktop"]>["updates"]["get"]>>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy: Record<string, string> = {
  "update.available": "发现新版本",
  "update.close": "关闭更新提示",
  "update.download": "下载更新",
  "update.downloaded": "更新已下载",
  "update.downloading": "正在下载",
  "update.failed": "下载失败，请重试",
  "update.open": "查看可用更新",
  "update.restarting": "下载完成，正在自动重启…",
  "update.retry": "重新下载",
  "update.short": "更新",
};

const t = ((key: string) => copy[key] ?? key) as ComponentProps<typeof DesktopUpdateControl>["t"];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => { root?.unmount(); });
  }
  container?.remove();
  root = undefined;
  container = undefined;
  Reflect.deleteProperty(window, "deepseekDesktop");
});

describe("DesktopUpdateControl", () => {
  it("downloads an available update, reports progress, and announces automatic restart", async () => {
    let statusListener: ((status: UpdateStatus) => void) | undefined;
    const available: UpdateStatus = {
      state: "available",
      currentVersion: "1.0.0",
      version: "1.1.0",
    };
    const download = vi.fn(async (): Promise<UpdateStatus> => ({
      ...available,
      state: "downloading",
      percent: 37,
      transferred: 370,
      total: 1_000,
    }));
    Object.defineProperty(window, "deepseekDesktop", {
      configurable: true,
      value: {
        updates: {
          get: vi.fn(async () => available),
          download,
          onStatus: (listener: (status: UpdateStatus) => void) => {
            statusListener = listener;
            return () => { statusListener = undefined; };
          },
        },
      },
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(DesktopUpdateControl, { t }));
    });

    expect(container.textContent).toContain("发现新版本");
    expect(container.textContent).toContain("v1.1.0");
    expect(container.textContent).toContain("更新");
    const downloadButton = [...container.querySelectorAll("button")]
      .find(button => button.textContent === "下载更新");
    expect(downloadButton).toBeDefined();

    await act(async () => { downloadButton?.click(); });
    expect(download).toHaveBeenCalledOnce();
    expect(container.querySelector("progress")?.value).toBe(37);
    expect(container.textContent).toContain("37%");

    await act(async () => {
      statusListener?.({ ...available, state: "downloaded", percent: 100 });
    });
    expect(container.textContent).toContain("下载完成，正在自动重启…");
    expect(container.textContent).not.toContain("重启并更新");
  });
});
