import type { MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
  WORKBENCH_DEFAULT, WORKBENCH_MAX, WORKBENCH_MIN,
} from './columns.ts'

export interface LayoutState {
  panelInfo: PanelInfo
  rightbarFullscreen: boolean
  sidebar: number
  details: number
  workbenchWidth: number
  narrow: boolean
  narrowExpanded: boolean
}

type LayoutActions = {
  selectPanel: (draft: LayoutState, panelId: MainPanelId | null) => void
  openRightbar: (draft: LayoutState, track: boolean, fullscreen: boolean) => void
  closeRightbar: (draft: LayoutState) => void
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  setWorkbenchWidth: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
}

/** Root-scoped geometry store used by both the frame and ctx.layout. */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions> {
  return defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      rightbarFullscreen: false,
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      workbenchWidth: WORKBENCH_DEFAULT,
      narrow: false,
      narrowExpanded: false,
    }),
    actions: {
      selectPanel: (draft, panelId) => { draft.panelInfo = { activePanelId: panelId } },
      openRightbar: (draft, track, fullscreen) => { draft.details = track ? (draft.details || DETAILS_DEFAULT) : 0; draft.rightbarFullscreen = fullscreen },
      closeRightbar: draft => { draft.details = 0; draft.rightbarFullscreen = false },
      setSidebar: (draft, px: number) => {
        draft.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX)
      },
      setDetails: (draft, px: number) => {
        draft.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX)
      },
      setWorkbenchWidth: (draft, px: number) => {
        draft.workbenchWidth = clampWidth(px, WORKBENCH_MIN, WORKBENCH_MAX)
      },
      toggleSidebar: (draft) => {
        if (draft.narrow) draft.narrowExpanded = !draft.narrowExpanded
        else draft.sidebar = draft.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      setNarrow: (draft, narrow: boolean) => {
        if (draft.narrow === narrow) return
        draft.narrow = narrow
        draft.narrowExpanded = false
      },
      openDetails: (draft) => {
        if (draft.details === 0) draft.details = DETAILS_DEFAULT
      },
      closeDetails: (draft) => { draft.details = 0 },
    },
  })
}
