import { describe, expect, it } from "vitest";
import {
  APP_MAIN_WINDOW_FOCUS_REQUEST,
  APP_WINDOW_OPEN_REQUEST,
  isAppMainWindowFocusRequest,
  isAppWindowOpenRequest,
  isSameOriginHttpUrl,
} from "./app-window-request.js";

describe("main window focus requests", () => {
  it("accepts only the dedicated request object", () => {
    expect(isAppMainWindowFocusRequest({ type: APP_MAIN_WINDOW_FOCUS_REQUEST })).toBe(true);
    expect(isAppMainWindowFocusRequest(APP_MAIN_WINDOW_FOCUS_REQUEST)).toBe(false);
    expect(isAppMainWindowFocusRequest({ type: APP_WINDOW_OPEN_REQUEST })).toBe(false);
  });
});

describe("app window open requests", () => {
  it("accepts well-formed requests", () => {
    expect(
      isAppWindowOpenRequest({ type: APP_WINDOW_OPEN_REQUEST, url: "http://127.0.0.1:1/x" }),
    ).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(isAppWindowOpenRequest(null)).toBe(false);
    expect(isAppWindowOpenRequest("deepdeck:open-app-window")).toBe(false);
    expect(isAppWindowOpenRequest({ type: APP_WINDOW_OPEN_REQUEST })).toBe(false);
    expect(isAppWindowOpenRequest({ type: APP_WINDOW_OPEN_REQUEST, url: 42 })).toBe(false);
    expect(isAppWindowOpenRequest({ type: "dsh-community-market:restart", url: "http://x/" })).toBe(false);
  });
});

describe("same-origin app window policy", () => {
  const origin = "http://127.0.0.1:3210";

  it("allows same-origin http(s) URLs on any path", () => {
    expect(isSameOriginHttpUrl("http://127.0.0.1:3210/", origin)).toBe(true);
    expect(isSameOriginHttpUrl("http://127.0.0.1:3210/nga-reader/app", origin)).toBe(true);
    expect(isSameOriginHttpUrl("https://127.0.0.1:3210/x", origin)).toBe(false);
  });

  it("rejects foreign origins, other protocols, and garbage", () => {
    expect(isSameOriginHttpUrl("http://127.0.0.1:9999/", origin)).toBe(false);
    expect(isSameOriginHttpUrl("https://evil.example/", origin)).toBe(false);
    expect(isSameOriginHttpUrl("file:///etc/passwd", origin)).toBe(false);
    expect(isSameOriginHttpUrl("about:blank", origin)).toBe(false);
    expect(isSameOriginHttpUrl("not a url", origin)).toBe(false);
  });
});
