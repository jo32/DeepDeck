import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppPersistedApplyState } from './contracts.js'

interface PersistedAppRecord {
  readonly packageName: string
  readonly sourcePackageRoot: string
  readonly status: 'applied' | 'restart-queued'
  readonly appliedDigest?: string
  readonly appliedFiles?: Readonly<Record<string, string>>
  readonly pendingRestartDigest?: string
  readonly pendingRestartFiles?: Readonly<Record<string, string>>
  readonly queuedGeneration?: string
  readonly lastApplyId: string
  readonly lastAppliedAt: string
  readonly outputRevision: string
}

interface PersistedDocument {
  readonly version: 1
  readonly apps: Readonly<Record<string, PersistedAppRecord>>
}

const EMPTY_DOCUMENT: PersistedDocument = Object.freeze({ version: 1, apps: Object.freeze({}) })

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecord(value: unknown): PersistedAppRecord {
  if (!isObject(value)) throw new Error('DeepDeck App apply state contains an invalid App record.')
  const status = value.status
  if (
    typeof value.packageName !== 'string'
    || typeof value.sourcePackageRoot !== 'string'
    || (status !== 'applied' && status !== 'restart-queued')
    || typeof value.lastApplyId !== 'string'
    || typeof value.lastAppliedAt !== 'string'
    || typeof value.outputRevision !== 'string'
    || (value.appliedDigest !== undefined && typeof value.appliedDigest !== 'string')
    || (value.pendingRestartDigest !== undefined && typeof value.pendingRestartDigest !== 'string')
    || (value.queuedGeneration !== undefined && typeof value.queuedGeneration !== 'string')
  ) throw new Error('DeepDeck App apply state contains an invalid App record.')
  const parseFiles = (files: unknown): Readonly<Record<string, string>> => {
    if (!isObject(files) || Object.values(files).some(hash => typeof hash !== 'string')) {
      throw new Error('DeepDeck App apply state contains invalid source file hashes.')
    }
    return files as Readonly<Record<string, string>>
  }
  if (
    (status === 'applied' && (value.appliedDigest === undefined || value.appliedFiles === undefined))
    || (status === 'restart-queued' && (
      value.pendingRestartDigest === undefined
      || value.pendingRestartFiles === undefined
      || value.queuedGeneration === undefined
    ))
  ) throw new Error('DeepDeck App apply state record is incomplete; refusing to assume source is applied.')
  return {
    packageName: value.packageName,
    sourcePackageRoot: value.sourcePackageRoot,
    status,
    ...(value.appliedDigest === undefined ? {} : { appliedDigest: value.appliedDigest }),
    ...(value.appliedFiles === undefined ? {} : { appliedFiles: parseFiles(value.appliedFiles) }),
    ...(value.pendingRestartDigest === undefined ? {} : { pendingRestartDigest: value.pendingRestartDigest }),
    ...(value.pendingRestartFiles === undefined ? {} : { pendingRestartFiles: parseFiles(value.pendingRestartFiles) }),
    ...(value.queuedGeneration === undefined ? {} : { queuedGeneration: value.queuedGeneration }),
    lastApplyId: value.lastApplyId,
    lastAppliedAt: value.lastAppliedAt,
    outputRevision: value.outputRevision,
  }
}

function parseDocument(value: unknown): PersistedDocument {
  if (!isObject(value) || value.version !== 1 || !isObject(value.apps)) {
    throw new Error('DeepDeck App apply state is invalid; refusing to assume source is applied.')
  }
  const apps: Record<string, PersistedAppRecord> = {}
  for (const [id, record] of Object.entries(value.apps)) apps[id] = parseRecord(record)
  return { version: 1, apps }
}

function publicState(record: PersistedAppRecord | undefined): AppPersistedApplyState {
  if (record === undefined) return Object.freeze({ status: 'unknown' })
  return Object.freeze({
    status: record.status,
    ...(record.appliedDigest === undefined ? {} : { appliedDigest: record.appliedDigest }),
    ...(record.pendingRestartDigest === undefined ? {} : { pendingRestartDigest: record.pendingRestartDigest }),
    lastApplyId: record.lastApplyId,
    lastAppliedAt: record.lastAppliedAt,
    outputRevision: record.outputRevision,
  })
}

/** Durable, serialized authority for the source revision active in each App. */
export class AppApplyStateStore {
  private document?: PersistedDocument
  private mutation = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly processGeneration: string,
  ) {}

  async get(
    appId: string,
    packageName: string,
    sourcePackageRoot: string,
  ): Promise<AppPersistedApplyState> {
    return publicState(await this.recordFor(appId, packageName, sourcePackageRoot))
  }

  async changedFiles(
    appId: string,
    packageName: string,
    sourcePackageRoot: string,
    currentFiles: Readonly<Record<string, string>>,
  ): Promise<readonly string[] | undefined> {
    const record = await this.recordFor(appId, packageName, sourcePackageRoot)
    const previous = record?.status === 'restart-queued'
      ? record.pendingRestartFiles
      : record?.appliedFiles
    if (previous === undefined) return undefined
    const paths = new Set([...Object.keys(previous), ...Object.keys(currentFiles)])
    return Object.freeze([...paths].filter(path => previous[path] !== currentFiles[path]).sort())
  }

  async recordApplied(input: {
    readonly appId: string
    readonly packageName: string
    readonly sourcePackageRoot: string
    readonly sourceDigest: string
    readonly sourceFiles: Readonly<Record<string, string>>
    readonly applyId: string
    readonly appliedAt: string
    readonly outputRevision: string
  }): Promise<void> {
    await this.update(input.appId, {
      packageName: input.packageName,
      sourcePackageRoot: input.sourcePackageRoot,
      status: 'applied',
      appliedDigest: input.sourceDigest,
      appliedFiles: input.sourceFiles,
      lastApplyId: input.applyId,
      lastAppliedAt: input.appliedAt,
      outputRevision: input.outputRevision,
    })
  }

  async recordRestartQueued(input: {
    readonly appId: string
    readonly packageName: string
    readonly sourcePackageRoot: string
    readonly sourceDigest: string
    readonly sourceFiles: Readonly<Record<string, string>>
    readonly applyId: string
    readonly appliedAt: string
    readonly outputRevision: string
  }): Promise<void> {
    const previous = (await this.load()).apps[input.appId]
    await this.update(input.appId, {
      packageName: input.packageName,
      sourcePackageRoot: input.sourcePackageRoot,
      status: 'restart-queued',
      ...(previous?.appliedDigest === undefined ? {} : { appliedDigest: previous.appliedDigest }),
      ...(previous?.appliedFiles === undefined ? {} : { appliedFiles: previous.appliedFiles }),
      pendingRestartDigest: input.sourceDigest,
      pendingRestartFiles: input.sourceFiles,
      queuedGeneration: this.processGeneration,
      lastApplyId: input.applyId,
      lastAppliedAt: input.appliedAt,
      outputRevision: input.outputRevision,
    })
  }

  /** A successfully registered App after a process restart proves its queued source is active. */
  async promoteRestarted(
    appId: string,
    packageName: string,
    sourcePackageRoot: string,
  ): Promise<void> {
    const record = (await this.load()).apps[appId]
    if (
      record?.status !== 'restart-queued'
      || record.pendingRestartDigest === undefined
      || record.packageName !== packageName
      || record.sourcePackageRoot !== sourcePackageRoot
      || record.queuedGeneration === this.processGeneration
    ) return
    await this.update(appId, {
      packageName: record.packageName,
      sourcePackageRoot: record.sourcePackageRoot,
      status: 'applied',
      appliedDigest: record.pendingRestartDigest,
      ...(record.pendingRestartFiles === undefined ? {} : { appliedFiles: record.pendingRestartFiles }),
      lastApplyId: record.lastApplyId,
      lastAppliedAt: record.lastAppliedAt,
      outputRevision: record.outputRevision,
    })
  }

  private async update(appId: string, record: PersistedAppRecord): Promise<void> {
    const operation = this.mutation.then(async () => {
      const current = await this.load()
      const next: PersistedDocument = {
        version: 1,
        apps: { ...current.apps, [appId]: record },
      }
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path)
      this.document = next
    })
    this.mutation = operation.catch(() => {})
    await operation
  }

  private async recordFor(
    appId: string,
    packageName: string,
    sourcePackageRoot: string,
  ): Promise<PersistedAppRecord | undefined> {
    const record = (await this.load()).apps[appId]
    if (record !== undefined && (
      record.packageName !== packageName
      || record.sourcePackageRoot !== sourcePackageRoot
    )) {
      throw new Error(`DeepDeck App apply state identity mismatch for '${appId}'; refusing to reuse it.`)
    }
    return record
  }

  private async load(): Promise<PersistedDocument> {
    if (this.document !== undefined) return this.document
    try {
      this.document = parseDocument(JSON.parse(await readFile(this.path, 'utf8')) as unknown)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.document = EMPTY_DOCUMENT
      else throw error
    }
    return this.document
  }
}
