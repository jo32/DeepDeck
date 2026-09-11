import type { GitHubSource } from './webmcp-package.js'

export interface WebMCPProjectState {
  directory: string
  sourcePath: string
  upstream: GitHubSource
  sourceDigest: string
  changed: boolean
  conflicts: string[]
  merging: boolean
}
export interface WebMCPMergePreview {
  token: string
  upstream: GitHubSource
  diff: string
  conflicts: string[]
}
