import type { DesktopApi } from "../shared/runtime.js";

declare global {
  interface Window {
    deepseekDesktop: DesktopApi;
  }
}

export {};
