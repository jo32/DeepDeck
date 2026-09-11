import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { packagePath, parsePackage, parseProvenance, type GitHubSource, type WebMCPPackage } from './webmcp-package.js'
import type { WebMCPMergePreview, WebMCPProjectState } from './project-contracts.js'

const execute = promisify(execFile)
export const sourceDigest = (source: string | Buffer) => createHash('sha256').update(source).digest('hex')
interface Metadata { upstream: GitHubSource; entry: string; pending?: GitHubSource }
interface Candidate { source: string; manifest: WebMCPPackage; provenance: GitHubSource }
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

/** A dedicated local Git branch. No command here pushes, runs project scripts, or activates tools. */
export class WebMCPProject {
  readonly directory: string
  private readonly metadataPath: string
  private readonly previews = new Map<string, { directory: string; digest: string; upstream: GitHubSource; expires: number }>()
  constructor(private readonly workspace: string) {
    this.directory = join(workspace, 'webmcp-project')
    this.metadataPath = join(workspace, '.webmcp-project.json')
  }
  private async git(directory: string, args: string[], allowed = [0]) {
    try {
      const { stdout } = await execute('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=DeepDeck', '-c', 'user.email=local@deepdeck.invalid', ...args], {
        cwd: directory, encoding: 'utf8', timeout: 60000, maxBuffer: 12 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_MERGE_AUTOEDIT: 'no' },
      })
      return stdout
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string }
      if (typeof failure.code === 'number' && allowed.includes(failure.code)) return failure.stdout ?? ''
      throw new Error(`Git project operation failed: ${failure.stderr?.trim() || (error as Error).message}`)
    }
  }
  private async metadata(): Promise<Metadata | undefined> {
    const value = await readFile(this.metadataPath, 'utf8').catch(error => { if (missing(error)) return undefined; throw error })
    if (!value) return undefined
    const parsed = JSON.parse(value)
    return { upstream: parseProvenance(parsed.upstream), entry: packagePath(parsed.entry), ...(parsed.pending ? { pending: parseProvenance(parsed.pending) } : {}) }
  }
  private async save(metadata: Metadata) {
    const temporary = `${this.metadataPath}.${randomUUID()}.pending`
    await writeFile(temporary, JSON.stringify(metadata, null, 2), { flag: 'wx', mode: 0o600 })
    await rename(temporary, this.metadataPath)
  }
  private async file(directory: string, path: string): Promise<Buffer> {
    let current = directory
    for (const part of packagePath(path).split('/')) {
      current = join(current, part)
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Project files cannot be symbolic links.')
    }
    const stat = await lstat(current)
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Project file is invalid or too large.')
    return readFile(current)
  }
  async manifest() {
    const metadata = (await this.metadata())!
    const manifest = parsePackage(JSON.parse((await this.file(this.directory, metadata.upstream.manifestPath)).toString('utf8')))
    if (manifest.entry !== metadata.entry) throw new Error('Changing the project entry path requires a new project checkout.')
    return manifest
  }
  private async snapshot(directory = this.directory) {
    const paths = [...new Set((await this.git(directory, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort()
    if (paths.length > 2000) throw new Error('Project has too many files for a merge preview.')
    const files = new Map<string, Buffer>(); const modes = new Map<string, number>(); let size = 0
    for (const path of paths) {
      const content = await this.file(directory, path).catch(error => { if (missing(error)) return undefined; throw error })
      if (content) { size += content.length; files.set(path, content); modes.set(path, (await lstat(join(directory, path))).mode & 0o777) }
      if (size > 10 * 1024 * 1024) throw new Error('Project exceeds the merge size limit.')
    }
    const head = (await this.git(directory, ['rev-parse', 'HEAD'])).trim()
    const digest = sourceDigest(JSON.stringify([head, ...paths.map(path => [path, files.has(path) ? sourceDigest(files.get(path)!) : null, modes.get(path)])]))
    return { files, paths, modes, digest }
  }
  async read() {
    const metadata = await this.metadata()
    if (!metadata) return undefined
    const source = (await this.file(this.directory, metadata.entry)).toString('utf8')
    return { source, upstream: metadata.upstream, sourceDigest: sourceDigest(source), sourcePath: join(this.directory, metadata.entry) }
  }
  async state(): Promise<WebMCPProjectState | undefined> {
    const project = await this.read()
    if (!project) return undefined
    const metadata = (await this.metadata())!
    const conflicts = (await this.git(this.directory, ['diff', '--name-only', '--diff-filter=U'])).trim().split('\n').filter(Boolean)
    return { directory: this.directory, sourcePath: project.sourcePath, sourceDigest: project.sourceDigest, upstream: project.upstream,
      changed: !!(await this.git(this.directory, ['diff', project.upstream.commit, '--'])).trim() || !!(await this.git(this.directory, ['ls-files', '--others', '--exclude-standard'])).trim(),
      conflicts, merging: !!metadata.pending }
  }
  async start(candidate: Candidate) {
    const existing = await this.state()
    if (existing) {
      if (existing.upstream.repositoryId !== candidate.provenance.repositoryId || existing.upstream.manifestPath !== candidate.provenance.manifestPath) throw new Error('A different project is already being edited for this site.')
      return existing
    }
    if (await lstat(this.directory).catch(error => { if (missing(error)) return undefined; throw error })) throw new Error('The project directory already exists. Preserve or move it before continuing.')
    const temporary = join(this.workspace, `.webmcp-project-${randomUUID()}`)
    await mkdir(temporary)
    try {
      await this.git(temporary, ['init'])
      await this.git(temporary, ['remote', 'add', 'upstream', candidate.provenance.repository])
      await this.git(temporary, ['fetch', '--no-tags', 'upstream', candidate.provenance.commit])
      await this.git(temporary, ['checkout', '-b', 'codex/webmcp-local', candidate.provenance.commit])
      const checked = (await this.file(temporary, candidate.manifest.entry)).toString('utf8')
      if (checked !== candidate.source) throw new Error('Checked-out source differs from the verified installed version.')
      await this.snapshot(temporary)
      await rename(temporary, this.directory)
      await this.save({ upstream: candidate.provenance, entry: candidate.manifest.entry })
    } finally { await rm(temporary, { recursive: true, force: true }) }
    return (await this.state())!
  }
  async write(source: string, expectedDigest: string) {
    const current = await this.read()
    if (!current) throw new Error('Create a project before editing it.')
    if (current.sourceDigest !== expectedDigest) throw new Error('Source changed since it was read. Read it again before writing.')
    if (Buffer.byteLength(source) > 512 * 1024 || source.includes('\0')) throw new Error('Invalid WebMCP source.')
    const temporary = `${current.sourcePath}.${randomUUID()}.pending`
    await writeFile(temporary, source, { flag: 'wx', mode: 0o600 })
    await rename(temporary, current.sourcePath)
    return this.state()
  }
  async updateManifest(expectedDigest: string, tools?: WebMCPPackage['tools']) {
    const current = (await this.read())!
    if (current.sourceDigest !== expectedDigest) throw new Error('Project changed while validating. Apply the current source again.')
    const manifest = await this.manifest()
    const bytes = JSON.stringify({ ...manifest, sourceSha256: current.sourceDigest, ...(tools ? { tools } : {}) }, null, 2) + '\n'
    const destination = join(this.directory, current.upstream.manifestPath)
    const temporary = `${destination}.${randomUUID()}.pending`
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }); await rename(temporary, destination)
  }
  private async protectIgnoredFiles(commit: string) {
    const ignored = (await this.git(this.directory, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard'])).split('\0').filter(Boolean)
    if (!ignored.length) return
    const upstream = (await this.git(this.directory, ['ls-tree', '-r', '--name-only', '-z', commit])).split('\0').filter(Boolean)
    for (const local of ignored) if (upstream.some(path => path === local || path.startsWith(`${local}/`) || local.startsWith(`${path}/`))) {
      throw new Error(`Upstream would overwrite ignored local file: ${local}. Preserve or move it before merging.`)
    }
  }
  async preview(candidate: Candidate): Promise<WebMCPMergePreview> {
    for (const [token, preview] of this.previews) if (preview.expires < Date.now()) await this.cancel(token)
    if (this.previews.size >= 3) throw new Error('Cancel an existing merge preview before creating another.')
    const metadata = await this.metadata()
    if (!metadata) throw new Error('Create a project before merging upstream.')
    if (metadata.pending) throw new Error('Finish or abort the current merge first.')
    if (candidate.provenance.repositoryId !== metadata.upstream.repositoryId || candidate.provenance.manifestPath !== metadata.upstream.manifestPath) throw new Error('Upstream project identity changed.')
    if (candidate.manifest.entry !== metadata.entry) throw new Error('Upstream moved its source entry. Review the repository migration before merging.')
    if (candidate.provenance.commit === metadata.upstream.commit) throw new Error('Already based on this upstream version.')
    await this.git(this.directory, ['fetch', '--no-tags', 'upstream', candidate.provenance.commit])
    await this.git(this.directory, ['merge-base', '--is-ancestor', metadata.upstream.commit, candidate.provenance.commit])
    await this.protectIgnoredFiles(candidate.provenance.commit)
    const snapshot = await this.snapshot()
    const token = randomUUID(); const temporary = join(this.workspace, `.webmcp-merge-${token}`)
    await this.git(this.directory, ['worktree', 'add', '--detach', temporary, 'HEAD'])
    try {
      for (const path of snapshot.paths) {
        const content = snapshot.files.get(path)
        if (!content) await rm(join(temporary, path), { force: true })
        else { await mkdir(dirname(join(temporary, path)), { recursive: true }); await writeFile(join(temporary, path), content); await chmod(join(temporary, path), snapshot.modes.get(path)!) }
      }
      await this.git(temporary, ['add', '-A'])
      await this.git(temporary, ['commit', '--allow-empty', '-m', 'Checkpoint local WebMCP changes'])
      await this.git(temporary, ['merge', '--no-commit', '--no-ff', '--no-overwrite-ignore', candidate.provenance.commit], [0, 1])
      await this.git(temporary, ['rev-parse', '--verify', 'MERGE_HEAD'])
      await this.mergeManifest(temporary, metadata)
      const conflicts = (await this.git(temporary, ['diff', '--name-only', '--diff-filter=U'])).trim().split('\n').filter(Boolean)
      const diff = await this.git(temporary, ['diff', 'HEAD', '--'])
      this.previews.set(token, { directory: temporary, digest: snapshot.digest, upstream: candidate.provenance, expires: Date.now() + 10 * 60 * 1000 })
      return { token, upstream: candidate.provenance, diff, conflicts }
    } catch (error) { await this.git(this.directory, ['worktree', 'remove', '--force', temporary]); throw error }
  }
  /** The source digest is derived data; it must not create a conflict by itself. */
  private async mergeManifest(directory: string, metadata: Metadata) {
    const path = metadata.upstream.manifestPath
    const unmerged = (await this.git(directory, ['diff', '--name-only', '--diff-filter=U'])).trim().split('\n')
    if (!unmerged.includes(path)) return
    let versions: Record<string, unknown>[]
    try { versions = await Promise.all([1, 2, 3].map(async stage => {
      const value = JSON.parse(await this.git(directory, ['show', `:${stage}:${path}`]))
      parsePackage(value)
      return value as Record<string, unknown>
    })) } catch { return } // Add/delete or malformed manifests need an explicit resolution.
    const [base, ours, theirs] = versions
    const merged = { ...ours }
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    for (const key of new Set([...Object.keys(base!), ...Object.keys(ours!), ...Object.keys(theirs!)])) {
      if (key === 'sourceSha256') continue
      if (equal(ours![key], theirs![key]) || equal(theirs![key], base![key])) continue
      if (!equal(ours![key], base![key])) return // Preserve real metadata/schema conflicts for review.
      if (theirs![key] === undefined) delete merged[key]
      else Object.defineProperty(merged, key, { value: theirs![key], enumerable: true, configurable: true, writable: true })
    }
    merged.sourceSha256 = sourceDigest(await this.file(directory, metadata.entry))
    await writeFile(join(directory, path), JSON.stringify(merged, null, 2) + '\n')
    await this.git(directory, ['add', '--', path])
  }
  async cancel(token: string) {
    const preview = this.previews.get(token)
    if (preview) { await this.git(this.directory, ['worktree', 'remove', '--force', preview.directory]); this.previews.delete(token) }
  }
  async merge(token: string) {
    const preview = this.previews.get(token)
    if (!preview || preview.expires < Date.now()) throw new Error('Merge preview expired. Check upstream again.')
    if ((await this.snapshot()).digest !== preview.digest) throw new Error('Local project changed. Review a fresh merge preview.')
    const metadata = (await this.metadata())!
    await this.protectIgnoredFiles(preview.upstream.commit)
    await this.git(this.directory, ['add', '-A'])
    await this.git(this.directory, ['commit', '--allow-empty', '-m', 'Checkpoint before upstream merge'])
    await this.save({ ...metadata, pending: preview.upstream })
    try {
      await this.git(this.directory, ['merge', '--no-commit', '--no-ff', '--no-overwrite-ignore', preview.upstream.commit], [0, 1])
      await this.git(this.directory, ['rev-parse', '--verify', 'MERGE_HEAD'])
    } catch (error) {
      // A failed merge command must not leave a false pending state.
      await this.git(this.directory, ['merge', '--abort']).catch(() => {})
      await this.save(metadata)
      throw error
    }
    await this.mergeManifest(this.directory, metadata)
    await this.cancel(token)
    const state = (await this.state())!
    if (!state.conflicts.length) return this.finish()
    return state
  }
  async finish() {
    const metadata = await this.metadata()
    if (!metadata?.pending) throw new Error('No merge is in progress.')
    const conflicts = (await this.git(this.directory, ['diff', '--name-only', '--diff-filter=U'])).trim().split('\n').filter(Boolean)
    for (const path of conflicts) {
      const content = await this.file(this.directory, path).catch(error => { if (missing(error)) return undefined; throw error })
      if (content && /^(?:<{7}|={7}|>{7})(?: |$)/mu.test(content.toString('utf8'))) throw new Error(`Resolve conflict markers in ${path} before finishing.`)
    }
    await this.updateManifest((await this.read())!.sourceDigest)
    await this.git(this.directory, ['add', '-A'])
    await this.git(this.directory, ['diff', '--cached', '--check'])
    await this.git(this.directory, ['commit', '--no-edit'])
    await this.save({ upstream: metadata.pending, entry: metadata.entry })
    return this.state()
  }
  async abort() {
    const metadata = await this.metadata()
    if (!metadata?.pending) throw new Error('No merge is in progress.')
    await this.git(this.directory, ['merge', '--abort'])
    await this.save({ upstream: metadata.upstream, entry: metadata.entry })
    return this.state()
  }
  async dispose() { for (const token of this.previews.keys()) await this.cancel(token) }
}
