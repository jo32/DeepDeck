export interface BunBuilderRuntimeStatus {
  readonly available: boolean
  readonly version?: string
  readonly error?: string
  readonly busy: boolean
}

export interface BunBuildPreview {
  readonly previewId: string
  readonly packageName: string
  readonly version: string
  readonly packageSubdirectory: string
  readonly buildScript: string
  readonly packageKind: 'plugin' | 'bundle'
  readonly bundlePatch?: string
  readonly confirmation: string
  readonly frozenInstall: boolean
  readonly hotUpdateAvailable: boolean
  readonly hotUpdateReason?: string
  readonly warnings: readonly string[]
  readonly expiresAt: string
}

export interface BunBuildLogs {
  readonly install: string
  readonly build: string
  readonly pack: string
}

export interface BunBuildResult {
  readonly previewId: string
  readonly packageName: string
  readonly version: string
  readonly packageKind: 'plugin' | 'bundle'
  readonly bundlePatch?: string
  readonly artifactPath: string
  readonly artifactSha256: string
  readonly artifactBytes: number
  readonly completedAt: string
  readonly logs: BunBuildLogs
}

/** A reviewed source tree after dependencies and its declared build ran in place. */
export interface BunSourceBuildResult {
  readonly previewId: string
  readonly packageName: string
  readonly version: string
  readonly packageKind: 'plugin' | 'bundle'
  readonly bundlePatch?: string
  readonly sourcePackageRoot: string
  readonly completedAt: string
  readonly logs: Pick<BunBuildLogs, 'install' | 'build'>
}

export interface BunHotUpdateResult {
  readonly previewId: string
  readonly packageName: string
  readonly version: string
  readonly sourcePackageRoot: string
  readonly completedAt: string
  readonly hostReloaded: boolean
  readonly buildLog: string
}

export type BunBuilderApiRequest =
  | { readonly action: 'status' }
  | {
      readonly action: 'preview'
      readonly sourceDirectory: string
      readonly packageSubdirectory?: string
    }
  | {
      readonly action: 'build'
      readonly previewId: string
      readonly confirmation: string
    }
  | {
      readonly action: 'hot-update'
      readonly previewId: string
      readonly confirmation: string
    }
  | { readonly action: 'discard'; readonly previewId: string }

export type BunBuilderApiResponse =
  | { readonly ok: true; readonly status: BunBuilderRuntimeStatus }
  | { readonly ok: true; readonly preview: BunBuildPreview }
  | { readonly ok: true; readonly result: BunBuildResult }
  | { readonly ok: true; readonly hotUpdate: BunHotUpdateResult }
  | { readonly ok: true; readonly discarded: true }
  | { readonly ok: false; readonly error: string; readonly logs?: Partial<BunBuildLogs> }
