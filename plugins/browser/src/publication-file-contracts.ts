/** Read-only publication browser responses, shared by the Host and Client. */
export interface FsEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
  size: number
}

export interface FsListing {
  path: string
  home: string
  parent: string | null
  crumbs: Array<{ name: string; path: string }>
  entries: FsEntry[]
  truncated: boolean
}

export interface TextHead {
  kind: 'text' | 'binary' | 'empty'
  size: number
  truncated: boolean
  text?: string
}

export type FilesTarget = { kind: 'workspace' } | { kind: 'webmcp' } | { kind: 'draft'; draft: string }
