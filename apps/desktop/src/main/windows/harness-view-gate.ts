function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Keeps the native splash visible until both the Harness document and the
 * plugin-owned desktop frame are ready. The two signals may arrive in either
 * order, so the gate only opens after observing both for the current load.
 */
export class HarnessViewGate {
  private expectedOrigin: string | undefined;
  private active = false;
  private documentLoaded = false;
  private clientReady = false;

  begin(url: string): void {
    const origin = originOf(url);
    if (!origin) throw new TypeError(`Invalid Harness URL: ${url}`);
    this.expectedOrigin = origin;
    this.active = true;
    this.documentLoaded = false;
    this.clientReady = false;
  }

  allows(url: string): boolean {
    return this.expectedOrigin !== undefined && originOf(url) === this.expectedOrigin;
  }

  beginDocument(url: string): boolean {
    if (!this.active || !this.allows(url)) return false;
    this.documentLoaded = false;
    this.clientReady = false;
    return true;
  }

  finishDocument(url: string): boolean {
    if (!this.active || !this.allows(url)) return false;
    this.documentLoaded = true;
    return this.isReady();
  }

  markClientReady(url: string): boolean {
    if (!this.active || !this.allows(url)) return false;
    this.clientReady = true;
    return this.isReady();
  }

  suspend(): void {
    this.active = false;
    this.documentLoaded = false;
    this.clientReady = false;
  }

  private isReady(): boolean {
    return this.documentLoaded && this.clientReady;
  }
}
