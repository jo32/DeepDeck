/** Observable readiness handshake for the plugin-owned first visible frame. */
export interface BrandCompositionLedger {
  isReady: () => boolean
  subscribe: (listener: () => void) => () => void
}

/**
 * Keeps Electron's native splash in front until the branded Hero has committed.
 * Readiness is monotonic for one Harness document; a reload creates a new
 * client runtime and therefore a fresh controller.
 */
export class BrandCompositionController implements BrandCompositionLedger {
  private ready = false
  private readonly listeners = new Set<() => void>()

  isReady = (): boolean => this.ready

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  markReady(): void {
    if (this.ready) return
    this.ready = true
    for (const listener of [...this.listeners]) listener()
  }
}
