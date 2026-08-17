import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createLayoutStore } from './stores.ts'

export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/** Cordis layout service backed by the custom root entry's store. */
export class DesktopLayoutController implements ILayout {
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
