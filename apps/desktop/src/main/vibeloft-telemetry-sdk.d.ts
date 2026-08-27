declare module "@vibeloft/telemetry-electron" {
  export interface VibeLoftTelemetryOptions {
    productId: string;
    authKey: string;
    appId: string;
    app?: {
      getPath(name: string): string;
      getLocale(): string;
    };
  }

  export class VibeLoftTelemetry {
    static create(options: VibeLoftTelemetryOptions): Promise<VibeLoftTelemetry>;
    trackScreen(name: string): string | null;
    close(options?: { flushPending?: boolean }): Promise<void>;
  }
}
