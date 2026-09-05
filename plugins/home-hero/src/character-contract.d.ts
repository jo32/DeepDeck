import type { ReactElement, ReactNode } from 'react'

/** Shared brand renderers. The home-hero plugin owns the model and interaction. */
export interface DeepDeckCharacterService {
  readonly Icon: (props: { readonly size?: number; readonly className?: string | undefined }) => ReactElement
  readonly Character: (props: { readonly active?: boolean }) => ReactElement
  /** Keep the original send/stop character compact, including an empty session. */
  readonly DockedComposer: (props: { readonly children: ReactNode }) => ReactElement
}
