import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createLayoutStore } from './stores.ts'

export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/** Cordis layout service backed by the custom root entry's store. */
export class DesktopLayoutController implements ILayout {
  private navigation = new AbortController()
  constructor(private readonly hasPanel: (id: MainPanelId) => boolean = () => false) {}
  selectPanel(id: MainPanelId | null): void {
    if (id !== null && !this.hasPanel(id)) throw new Error(`Unknown main panel: ${id}`)
    this.navigation.abort()
    this.#require().selectPanel(id)
  }
  beginNavigation(): AbortSignal { this.navigation.abort(); this.navigation = new AbortController(); return this.navigation.signal }
  dispose(): void { this.navigation.abort() }
  openRightbar(track: boolean, fullscreen: boolean): void { this.#require().openRightbar(track, fullscreen) }
  closeRightbar(): void { this.#require().closeRightbar() }
  #panels: PanelActions | undefined

  attachPanels(actions: PanelActions): void {
    this.#panels = actions
  }

  toggleSidebar(): void { this.#require().toggleSidebar() }
  openDetails(): void { this.#require().openDetails() }
  closeDetails(): void { this.#require().closeDetails() }

  #require(): PanelActions {
    if (this.#panels === undefined) {
      throw new Error('desktop layout: root panel actions are not mounted')
    }
    return this.#panels
  }
}
