import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'

const MAX_FILES = 20_000
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_TOTAL_BYTES = 256 * 1024 * 1024
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules'])
const STRUCTURAL_FILES = new Set([
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

export interface AppWorkspaceSnapshot {
  readonly digest: string
  readonly files: ReadonlyMap<string, string>
}

function portable(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}

function ordered<T extends { readonly name: string }>(entries: T[]): T[] {
  return entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
}

/** Hash one App tree without following links or observing dependency/VCS state. */
export async function snapshotAppWorkspace(
  workspace: string,
  signal?: AbortSignal,
): Promise<AppWorkspaceSnapshot> {
  signal?.throwIfAborted()
  const root = await realpath(workspace)
  const files = new Map<string, string>()
  const pending = [root]
  let totalBytes = 0

  while (pending.length > 0) {
    signal?.throwIfAborted()
    const directory = pending.pop()!
    for (const entry of ordered(await readdir(directory, { withFileTypes: true }))) {
      signal?.throwIfAborted()
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue
      const absolute = join(directory, entry.name)
      const path = portable(relative(root, absolute))
      if (entry.isDirectory()) {
        pending.push(absolute)
        continue
      }
      if (files.size >= MAX_FILES) throw new Error('App Workspace contains too many files to track safely.')
      const stat = await lstat(absolute)
      const hash = createHash('sha256')
      hash.update(path).update('\0').update(String(stat.mode & 0o777)).update('\0')
      if (entry.isSymbolicLink()) {
        hash.update('link\0').update(await readlink(absolute))
      } else if (entry.isFile()) {
        if (stat.size > MAX_FILE_BYTES) throw new Error(`App Workspace file is too large to track: ${path}`)
        totalBytes += stat.size
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('App Workspace is too large to track safely.')
        hash.update('file\0').update(await readFile(absolute))
      } else {
        hash.update('other\0')
      }
      files.set(path, hash.digest('hex'))
    }
  }

  const tree = createHash('sha256')
  for (const path of [...files.keys()].sort()) {
    tree.update(path).update('\0').update(files.get(path)!).update('\0')
  }
  return Object.freeze({ digest: tree.digest('hex'), files })
}

export function changedWorkspaceFiles(
  before: AppWorkspaceSnapshot,
  after: AppWorkspaceSnapshot,
): readonly string[] {
  const paths = new Set([...before.files.keys(), ...after.files.keys()])
  return Object.freeze([...paths]
    .filter(path => before.files.get(path) !== after.files.get(path))
    .sort())
}

/** Changes whose loader/profile inputs cannot be proven safe for Cordis HMR. */
export function requiresRuntimeRestart(paths: readonly string[]): boolean {
  return paths.some((path) => {
    const name = basename(path)
    return STRUCTURAL_FILES.has(name)
      || name === 'cordis.patch.yml'
      || name === 'cordis.patch.yaml'
      || /(?:^|\/)invariant\.(?:[cm]?[jt]sx?|d\.ts)$/u.test(path)
  })
}
