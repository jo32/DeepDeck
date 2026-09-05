import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build as compile, version as compilerVersion } from 'esbuild'

export const MAX_WEBMCP_SOURCE_BYTES = 512 * 1024
export const MAX_WEBMCP_COMPILED_BYTES = 1024 * 1024
const MAX_METADATA_BYTES = 8 * 1024
const REVISION_PATTERN = /^[a-f0-9]{64}$/u

export interface WebMCPRevision {
  readonly revision: string
  readonly createdAt: string
  readonly sourceDigest: string
  readonly compiledDigest: string
}

export interface WebMCPState {
  readonly origin: string
  readonly workspacePath: string
  readonly sourcePath: string
  readonly hasSource: boolean
  readonly enabled: boolean
  readonly activeRevision?: string
  readonly previousRevision?: string
  readonly revisions: readonly WebMCPRevision[]
}

export interface WebMCPInstallation {
  readonly origin: string
  readonly revision: string
  /** Compiled browser JavaScript, not the editable TypeScript source. */
  readonly source: string
  readonly sourceDigest: string
  readonly compiledDigest: string
}

interface Manifest extends WebMCPRevision {
  readonly schemaVersion: 1
  readonly origin: string
  readonly compiler: string
}

interface Metadata {
  readonly schemaVersion: 1
  readonly origin: string
  readonly enabled: boolean
  readonly activeRevision?: string
  readonly previousRevision?: string
}

interface SitePaths {
  readonly origin: string
  readonly workspacePath: string
  readonly sourcePath: string
  readonly revisionsPath: string
  readonly metadataPath: string
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function normalizeWebMCPOrigin(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('WebMCP requires an HTTP or HTTPS site without URL credentials.')
  }
  return url.origin
}

function revisionId(manifest: Pick<Manifest, 'origin' | 'sourceDigest' | 'compiledDigest' | 'compiler'>): string {
  return digest(JSON.stringify([manifest.origin, manifest.sourceDigest, manifest.compiledDigest, manifest.compiler]))
}

function assertRevision(revision: string): void {
  if (!REVISION_PATTERN.test(revision)) throw new Error('Invalid WebMCP revision.')
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reject symlinks at each owned directory, even when their target happens to be inside the store. */
async function directory(path: string): Promise<void> {
  await mkdir(path, { recursive: false }).catch(error => {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error
  })
  const stat = await lstat(path)
  if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(path) !== path) {
    throw new Error('WebMCP workspace contains an unsafe directory.')
  }
}

async function boundedRead(path: string, maximum: number): Promise<string | undefined> {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > maximum) throw new Error('WebMCP file is invalid or exceeds its size limit.')
    // Reading at most maximum + 1 also bounds files that grow after stat().
    const bytes = Buffer.alloc(maximum + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length)
      if (read.bytesRead === 0) break
      length += read.bytesRead
    }
    if (length > maximum) throw new Error('WebMCP file exceeds its size limit.')
    return bytes.subarray(0, length).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const pending = `${path}.${randomUUID()}.pending`
  try {
    await writeFile(pending, content, { flag: 'wx', mode: 0o600 })
    await rename(pending, path)
  } finally {
    await rm(pending, { force: true })
  }
}

/**
 * Persistent TypeScript sources and immutable browser-only builds. Building never
 * changes the active version: the caller must verify installation in a real page
 * before calling activate(). No source-controlled build commands are executed.
 */
export class WebMCPStore {
  private readonly root: Promise<string>
  private readonly pending = new Map<string, Promise<void>>()

  constructor(rootPath: string) {
    this.root = (async () => {
      const path = resolve(rootPath)
      await mkdir(path, { recursive: true })
      return await realpath(path)
    })()
  }

  async inspect(origin: string): Promise<WebMCPState> {
    return await this.withSite(origin, async paths => await this.state(paths))
  }

  async readSource(origin: string): Promise<string> {
    return await this.withSite(origin, async paths => await boundedRead(paths.sourcePath, MAX_WEBMCP_SOURCE_BYTES) ?? '')
  }

  async writeSource(origin: string, source: string): Promise<WebMCPState> {
    if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_WEBMCP_SOURCE_BYTES || source.includes('\0')) {
      throw new Error(`WebMCP source must be text of at most ${MAX_WEBMCP_SOURCE_BYTES} bytes without NUL characters.`)
    }
    return await this.withSite(origin, async paths => {
      await atomicWrite(paths.sourcePath, source)
      return await this.state(paths)
    })
  }

  async build(origin: string): Promise<WebMCPInstallation> {
    return await this.withSite(origin, async paths => {
      const source = await boundedRead(paths.sourcePath, MAX_WEBMCP_SOURCE_BYTES)
      if (source === undefined || source.trim().length === 0) throw new Error('Write WebMCP source before building.')
      const result = await compile({
        stdin: { contents: source, sourcefile: 'webmcp.ts', loader: 'ts' },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: ['es2022'],
        charset: 'utf8',
        legalComments: 'none',
        sourcemap: false,
        logLevel: 'silent',
        logOverride: { 'unsupported-dynamic-import': 'error', 'unsupported-require-call': 'error' },
        plugins: [{
          name: 'webmcp-no-runtime-imports',
          setup(builder) {
            // esbuild passes this expression to Go's regexp engine, which has no /u flag.
            builder.onResolve({ filter: /.*/ }, () => ({
              errors: [{ text: 'WebMCP uses a single TypeScript file; runtime imports and require() are not supported.' }],
            }))
          },
        }],
      })
      const compiled = result.outputFiles?.[0]?.text
      if (compiled === undefined || Buffer.byteLength(compiled) > MAX_WEBMCP_COMPILED_BYTES) {
        throw new Error('Compiled WebMCP is missing or exceeds its size limit.')
      }
      const identity = {
        origin: paths.origin,
        sourceDigest: digest(source),
        compiledDigest: digest(compiled),
        compiler: `esbuild@${compilerVersion}`,
      }
      const revision = revisionId(identity)
      const revisionPath = join(paths.revisionsPath, revision)
      const existing = await this.manifest(paths, revision, true)
      if (existing !== undefined) return await this.installation(paths, revision)
      const manifest: Manifest = {
        schemaVersion: 1,
        ...identity,
        revision,
        createdAt: new Date().toISOString(),
      }
      const pendingPath = join(paths.revisionsPath, `.pending-${randomUUID()}`)
      try {
        await directory(pendingPath)
        await writeFile(join(pendingPath, 'source.ts'), source, { flag: 'wx', mode: 0o600 })
        await writeFile(join(pendingPath, 'bundle.js'), compiled, { flag: 'wx', mode: 0o600 })
        await writeFile(join(pendingPath, 'revision.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
        await rename(pendingPath, revisionPath)
      } finally {
        await rm(pendingPath, { recursive: true, force: true })
      }
      return this.payload(manifest, compiled)
    })
  }

  async readRevision(origin: string, revision: string): Promise<WebMCPInstallation> {
    assertRevision(revision)
    return await this.withSite(origin, async paths => await this.installation(paths, revision))
  }

  async active(origin: string): Promise<WebMCPInstallation | undefined> {
    return await this.withSite(origin, async paths => {
      const metadata = await this.metadata(paths)
      return metadata.enabled && metadata.activeRevision !== undefined
        ? await this.installation(paths, metadata.activeRevision)
        : undefined
    })
  }

  /** Call only after native installation confirms the requested revision registered its tools. */
  async activate(origin: string, revision: string): Promise<WebMCPState> {
    assertRevision(revision)
    return await this.withSite(origin, async paths => {
      await this.installation(paths, revision)
      const current = await this.metadata(paths)
      const previous = current.activeRevision === revision ? current.previousRevision : current.activeRevision
      const metadata: Metadata = {
        schemaVersion: 1,
        origin: paths.origin,
        enabled: true,
        activeRevision: revision,
        ...(previous === undefined ? {} : { previousRevision: previous }),
      }
      await atomicWrite(paths.metadataPath, JSON.stringify(metadata, null, 2))
      return await this.state(paths)
    })
  }

  /** Re-enabling an existing version follows the same native verification gate as activate(). */
  async setEnabled(origin: string, enabled: boolean): Promise<WebMCPState> {
    return await this.withSite(origin, async paths => {
      const current = await this.metadata(paths)
      if (enabled) {
        if (current.activeRevision === undefined) throw new Error('No verified WebMCP revision is available to enable.')
        await this.installation(paths, current.activeRevision)
      }
      await atomicWrite(paths.metadataPath, JSON.stringify({ ...current, enabled }, null, 2))
      return await this.state(paths)
    })
  }

  private async withSite<T>(originValue: string, action: (paths: SitePaths) => Promise<T>): Promise<T> {
    const origin = normalizeWebMCPOrigin(originValue)
    const preceding = this.pending.get(origin) ?? Promise.resolve()
    const operation = preceding.then(async () => {
      const root = await this.root
      const workspacePath = join(root, digest(origin))
      await directory(workspacePath)
      await directory(join(workspacePath, 'src'))
      const revisionsPath = join(workspacePath, 'revisions')
      await directory(revisionsPath)
      return await action({
        origin,
        workspacePath,
        sourcePath: join(workspacePath, 'src', 'index.ts'),
        revisionsPath,
        metadataPath: join(workspacePath, 'state.json'),
      })
    })
    const settled = operation.then(() => undefined, () => undefined)
    this.pending.set(origin, settled)
    try {
      return await operation
    } finally {
      if (this.pending.get(origin) === settled) this.pending.delete(origin)
    }
  }

  private async metadata(paths: SitePaths): Promise<Metadata> {
    const contents = await boundedRead(paths.metadataPath, MAX_METADATA_BYTES)
    if (contents === undefined) return { schemaVersion: 1, origin: paths.origin, enabled: false }
    const value: unknown = JSON.parse(contents)
    if (
      !isRecord(value) || value.schemaVersion !== 1 || value.origin !== paths.origin || typeof value.enabled !== 'boolean'
      || (value.activeRevision !== undefined && (typeof value.activeRevision !== 'string' || !REVISION_PATTERN.test(value.activeRevision)))
      || (value.previousRevision !== undefined && (typeof value.previousRevision !== 'string' || !REVISION_PATTERN.test(value.previousRevision)))
      || (value.enabled && value.activeRevision === undefined)
    ) throw new Error('WebMCP state is invalid.')
    return value as unknown as Metadata
  }

  private async manifest(paths: SitePaths, revision: string, optional = false): Promise<Manifest | undefined> {
    assertRevision(revision)
    const path = join(paths.revisionsPath, revision)
    try {
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(path) !== path) {
        throw new Error('WebMCP revision contains an unsafe directory.')
      }
    } catch (error) {
      if (optional && isMissing(error)) return undefined
      throw error
    }
    const contents = await boundedRead(join(path, 'revision.json'), MAX_METADATA_BYTES)
    if (contents === undefined) throw new Error('WebMCP revision metadata is missing.')
    const value: unknown = JSON.parse(contents)
    if (
      !isRecord(value) || value.schemaVersion !== 1 || value.origin !== paths.origin || value.revision !== revision
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.compiler !== 'string' || typeof value.sourceDigest !== 'string' || !REVISION_PATTERN.test(value.sourceDigest)
      || typeof value.compiledDigest !== 'string' || !REVISION_PATTERN.test(value.compiledDigest)
      || revisionId(value as unknown as Manifest) !== revision
    ) throw new Error('WebMCP revision metadata is invalid.')
    return value as unknown as Manifest
  }

  private async installation(paths: SitePaths, revision: string): Promise<WebMCPInstallation> {
    const manifest = await this.manifest(paths, revision)
    if (manifest === undefined) throw new Error('WebMCP revision is missing.')
    const path = join(paths.revisionsPath, revision)
    const source = await boundedRead(join(path, 'source.ts'), MAX_WEBMCP_SOURCE_BYTES)
    const compiled = await boundedRead(join(path, 'bundle.js'), MAX_WEBMCP_COMPILED_BYTES)
    if (source === undefined || compiled === undefined || digest(source) !== manifest.sourceDigest || digest(compiled) !== manifest.compiledDigest) {
      throw new Error('WebMCP revision content failed its integrity check.')
    }
    return this.payload(manifest, compiled)
  }

  private payload(manifest: Manifest, source: string): WebMCPInstallation {
    return {
      origin: manifest.origin,
      revision: manifest.revision,
      source,
      sourceDigest: manifest.sourceDigest,
      compiledDigest: manifest.compiledDigest,
    }
  }

  private async state(paths: SitePaths): Promise<WebMCPState> {
    const metadata = await this.metadata(paths)
    const revisions: WebMCPRevision[] = []
    for (const name of await readdir(paths.revisionsPath)) {
      if (!REVISION_PATTERN.test(name)) continue
      const manifest = await this.manifest(paths, name)
      if (manifest !== undefined) {
        revisions.push({
          revision: manifest.revision,
          createdAt: manifest.createdAt,
          sourceDigest: manifest.sourceDigest,
          compiledDigest: manifest.compiledDigest,
        })
      }
    }
    revisions.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.revision.localeCompare(right.revision))
    return {
      origin: paths.origin,
      workspacePath: paths.workspacePath,
      sourcePath: paths.sourcePath,
      hasSource: await boundedRead(paths.sourcePath, MAX_WEBMCP_SOURCE_BYTES) !== undefined,
      enabled: metadata.enabled,
      ...(metadata.activeRevision === undefined ? {} : { activeRevision: metadata.activeRevision }),
      ...(metadata.previousRevision === undefined ? {} : { previousRevision: metadata.previousRevision }),
      revisions,
    }
  }
}
