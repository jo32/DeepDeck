// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, CONNECTION_STATUS_DELAY_MS } from "../src/renderer/App.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  Reflect.deleteProperty(window, "deepseekDesktop");
  vi.useRealTimers();
});

describe("desktop startup skeleton", () => {
  it("renders a workspace-shaped skeleton while connecting", () => {
    const html = renderToStaticMarkup(createElement(App));

    expect(html).toContain("data-desktop-splash");
    expect(html).toContain("data-splash-sidebar");
    expect(html).toContain("data-splash-skeleton");
    expect(html).toContain("data-splash-composer");
    expect(html.match(/skeleton-block/g)?.length).toBeGreaterThan(10);
    expect(html).not.toContain("正在连接 DeepDeck…");
  });

  it("reveals connection status only after three seconds", async () => {
    vi.useFakeTimers();
    let publishReady = (): void => {};
    Object.defineProperty(window, "deepseekDesktop", {
      configurable: true,
      value: {
        branding: { get: async () => ({
          id: "deepdeck",
          name: "DeepDeck",
          tagline: "你的本地智能工作伙伴",
          accentColor: "#635BFF",
          accentColorSoft: "#EEEAFE",
          markDataUrl: "",
        }) },
        runtime: {
          get: async () => ({
            state: "starting" as const,
            message: "正在连接 DeepDeck…",
          }),
          restart: async () => ({
            state: "starting" as const,
            message: "正在连接 DeepDeck…",
          }),
          readyForDisplay: () => {},
          onStatus: (listener: (status: {
            state: "ready";
            message: string;
            url: string;
          }) => void) => {
            publishReady = () => listener({
              state: "ready",
              message: "DeepDeck 已就绪",
              url: "http://127.0.0.1:3210",
            });
            return () => {};
          },
        },
      },
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(App)));

    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(CONNECTION_STATUS_DELAY_MS - 500));
    await act(async () => publishReady());
    await act(async () => vi.advanceTimersByTime(499));
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("正在打开 DeepDeck");
  });

  it("replaces the skeleton with an actionable error state", async () => {
    const restart = vi.fn(async () => ({
      state: "starting" as const,
      message: "正在重新连接 DeepDeck…",
    }));
    Object.defineProperty(window, "deepseekDesktop", {
      configurable: true,
      value: {
        branding: { get: async () => ({
          id: "deepdeck",
          name: "DeepDeck",
          tagline: "你的本地智能工作伙伴",
          accentColor: "#635BFF",
          accentColorSoft: "#EEEAFE",
          markDataUrl: "",
        }) },
        runtime: {
          get: async () => ({
            state: "error" as const,
            message: "DeepDeck 启动失败",
            details: "无法连接本地智能服务。",
          }),
          restart,
          readyForDisplay: () => {},
          onStatus: () => () => {},
        },
      },
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(App)));

    expect(container.querySelector("[data-splash-error]")).not.toBeNull();
    expect(container.querySelector("[data-splash-skeleton]")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain("无法打开工作区");

    const button = container.querySelector<HTMLButtonElement>(".retry-button");
    expect(button).not.toBeNull();
    await act(async () => button?.click());

    expect(restart).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-splash-skeleton]")).not.toBeNull();
  });
});
