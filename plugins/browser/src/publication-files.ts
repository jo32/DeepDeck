import { lstat, open, opendir, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { constants } from 'node:fs'
import type { FsEntry, FsListing, TextHead } from './publication-file-contracts.js'

const draftName = /^webmcp-publish-[a-zA-Z0-9_-]+$/
async function draftRoot(workspace: string, draft?: string) {
  const base = await realpath(workspace)
  if (draft === undefined) {
    const candidates = await Promise.all((await readdir(base, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && draftName.test(entry.name))
      .map(async entry => ({ name: entry.name, mtime: (await lstat(join(base, entry.name))).mtimeMs })))
    draft = candidates.sort((a, b) => b.mtime - a.mtime)[0]?.name
    if (!draft) return null
  }
  if (typeof draft !== 'string' || !draftName.test(draft) && draft !== 'webmcp-project') throw new Error('Invalid publication draft.')
  const root = join(base, draft)
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid publication directory.')
  return root
}

/** Paths come from the explorer response; the Host confines every request to its site's draft. */
async function scopedPath(root: string, path = root) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Invalid file path.')
  const rel = relative(root, path)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('File is outside this publication draft.')
  let current = root
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = join(current, segment)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not supported in publication drafts.')
  }
  const resolved = await realpath(path)
  const actual = relative(root, resolved)
  if (isAbsolute(actual) || actual === '..' || actual.startsWith(`..${sep}`)) throw new Error('File is outside this publication draft.')
  return resolved
}

export async function listDraftFiles(workspace: string, draft?: string, path?: string): Promise<(FsListing & { draft: string }) | null> {
  const root = await draftRoot(workspace, draft)
  if (!root) return null
  const current = await scopedPath(root, path)
  return { ...await listDirectory(root, current), draft: basename(root) }
}

/** The Files sidebar starts at the site's workspace, even before a draft is exported. */
export async function listWorkspaceFiles(workspace: string): Promise<FsListing> {
  const root = await realpath(workspace)
  return listDirectory(root, root)
}

async function listDirectory(root: string, current: string): Promise<FsListing> {
  const entries: FsEntry[] = []
  let truncated = false
  const directory = await opendir(current)
  for await (const entry of directory) {
    if (!entry.isFile() && !entry.isDirectory()) continue
    if (entries.length === 2000) { truncated = true; break }
    const target = join(current, entry.name)
    // A concurrent Agent may move/delete a row during enumeration.
    const info = await lstat(target).catch(() => undefined)
    if (!info || (!info.isDirectory() && !info.isFile())) continue
    entries.push({ name: entry.name, path: target, kind: info.isDirectory() ? 'dir' : 'file', size: info.size })
  }
  entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, 'en', { numeric: true }) : a.kind === 'dir' ? -1 : 1)
  const crumbs = [{ name: basename(root), path: root }]
  let crumbPath = root
  for (const segment of relative(root, current).split(sep).filter(Boolean)) {
    crumbPath = join(crumbPath, segment)
    crumbs.push({ name: segment, path: crumbPath })
  }
  return { path: current, home: root, parent: current === root ? null : dirname(current), crumbs, entries, truncated }
}

export async function readDraftFile(workspace: string, draft: string, path: string): Promise<TextHead> {
  if (typeof draft !== 'string' || typeof path !== 'string') throw new Error('Choose a draft file.')
  const root = await draftRoot(workspace, draft)
  if (!root) throw new Error('Publication draft not found.')
  const target = await scopedPath(root, path)
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error('Choose a regular file to preview.')
    const buffer = Buffer.alloc(Math.min(info.size, 300_000))
    let length = 0
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    const bytes = buffer.subarray(0, length)
    const metadata = { size: info.size, truncated: info.size > length }
    if (!length) return { ...metadata, kind: 'empty' }
    if (bytes.includes(0)) return { ...metadata, kind: 'binary' }
    try {
      // Streaming decode leaves an incomplete final UTF-8 code point out of a truncated preview.
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: metadata.truncated })
      return { ...metadata, kind: 'text', text }
    } catch { return { ...metadata, kind: 'binary' } }
  } finally { await handle.close() }
}
