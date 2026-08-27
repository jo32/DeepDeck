import { readFileSync } from "node:fs";
import type { App } from "electron";
import {
  VibeLoftTelemetry,
  type VibeLoftTelemetryOptions,
} from "@vibeloft/telemetry-electron";
import type { DesktopTelemetryScreen } from "../shared/runtime.js";

const PRODUCT_ID = "e3e05646-24b9-4532-9068-d8f29cad72f3";
const APP_ID = "com.jo32.deepdeck";
const AUTH_KEY_PATTERN = /^vl_native\.[A-Za-z0-9_-]{43}$/;

const SCREEN_ROUTES: Readonly<Record<DesktopTelemetryScreen, string>> = Object.freeze({
  home: "/home",
  apps: "/apps",
});

export interface EmbeddedTelemetryConfig {
  productId: string;
  appId: string;
  authKey: string;
}

interface VibeLoftTelemetryClient {
  trackScreen(name: string): string | null;
  close(options?: { flushPending?: boolean }): Promise<void>;
}

type CreateClient = (options: VibeLoftTelemetryOptions) => Promise<VibeLoftTelemetryClient>;

export interface DesktopTelemetryRuntime {
  readonly enabled: boolean;
  trackScreen(screen: unknown): boolean;
  close(): Promise<void>;
}

export interface DesktopTelemetryDependencies {
  readonly config?: EmbeddedTelemetryConfig;
  readonly createClient?: CreateClient;
  readonly warn?: (message: string, error: unknown) => void;
}

function disabledRuntime(): DesktopTelemetryRuntime {
  return Object.freeze({
    enabled: false,
    trackScreen: () => false,
    close: async () => {},
  });
}

export function parseEmbeddedTelemetryConfig(value: unknown): EmbeddedTelemetryConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<EmbeddedTelemetryConfig>;
  if (
    candidate.productId !== PRODUCT_ID ||
    candidate.appId !== APP_ID ||
    typeof candidate.authKey !== "string" ||
    !AUTH_KEY_PATTERN.test(candidate.authKey)
  ) {
    return undefined;
  }
  return {
    productId: candidate.productId,
    appId: candidate.appId,
    authKey: candidate.authKey,
  };
}

export function resolveTelemetryScreen(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return SCREEN_ROUTES[value as DesktopTelemetryScreen];
}

function readEmbeddedTelemetryConfig(): EmbeddedTelemetryConfig | undefined {
  try {
    const source = readFileSync(new URL("./vibeloft-telemetry-config.json", import.meta.url), "utf8");
    return parseEmbeddedTelemetryConfig(JSON.parse(source) as unknown);
  } catch {
    return undefined;
  }
}

export async function createDesktopTelemetry(
  electronApp: Pick<App, "getPath" | "getLocale">,
  dependencies: DesktopTelemetryDependencies = {},
): Promise<DesktopTelemetryRuntime> {
  const config = dependencies.config ?? readEmbeddedTelemetryConfig();
  if (!config) return disabledRuntime();

  const createClient = dependencies.createClient ?? ((options) => VibeLoftTelemetry.create(options));
  const warn = dependencies.warn ?? ((message, error) => console.warn(message, error));
  try {
    // Deliberately omit app.on/app.quit so the SDK cannot compete with
    // DeepDeck's existing coordinated before-quit transaction. bootstrap.ts
    // explicitly closes the runtime within that transaction instead.
    const client = await createClient({
      productId: config.productId,
      authKey: config.authKey,
      appId: config.appId,
      app: {
        getPath: name => electronApp.getPath(name as Parameters<App["getPath"]>[0]),
        getLocale: () => electronApp.getLocale(),
      },
    });
    return Object.freeze({
      enabled: true,
      trackScreen(screen: unknown): boolean {
        const route = resolveTelemetryScreen(screen);
        if (!route) return false;
        try {
          client.trackScreen(route);
          return true;
        } catch (error) {
          warn("Unable to queue VibeLoft telemetry", error);
          return false;
        }
      },
      close: async () => {
        await client.close({ flushPending: true });
      },
    });
  } catch (error) {
    warn("Unable to initialize VibeLoft telemetry", error);
    return disabledRuntime();
  }
}
