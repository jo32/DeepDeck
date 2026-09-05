import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserMode } from './contracts.js'

export interface SiteRecord {
  id: string
  origin: string
  title: string
  workspacePath: string
  sessionId?: string
  tabId?: string
  mode: BrowserMode
}
export function siteOrigin(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('A site must have an HTTP or HTTPS origin without embedded credentials.')
  return url.origin
}
export function siteId(origin: string): string { return createHash('sha256').update(siteOrigin(origin)).digest('hex').slice(0, 24) }

export class BrowserSiteStore {
  private records = new Map<string, SiteRecord>()
  private writes: Promise<void> = Promise.resolve()
  readonly ready: Promise<void>
  constructor(readonly root: string) { this.ready = this.load() }
  private async load(): Promise<void> {
    try {
      const data: unknown = JSON.parse(await readFile(join(this.root, 'sites.json'), 'utf8'))
      if (!Array.isArray(data)) throw new Error('Browser site registry is invalid.')
      for (const row of data) {
        if (!row || typeof row.origin !== 'string' || row.id !== siteId(row.origin)) throw new Error('Browser site registry contains an invalid site identity.')
        const record: SiteRecord = { id: row.id, origin: siteOrigin(row.origin), title: new URL(row.origin).hostname, workspacePath: join(this.root, 'sites', row.id), mode: row.mode === 'builder' ? 'builder' : 'use' }
        if (typeof row.sessionId === 'string') record.sessionId = row.sessionId
        // Native tab identities are not durable across desktop launches.
        this.records.set(record.id, record)
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  list(): SiteRecord[] { return [...this.records.values()].map(value => ({ ...value })) }
  get(id: string): SiteRecord { const site = this.records.get(id); if (!site) throw new Error('Unknown browser site.'); return { ...site } }
  bySession(sessionId: string): SiteRecord | undefined { return this.list().find(site => site.sessionId === sessionId) }
  async ensure(value: string): Promise<SiteRecord> {
    await this.ready
    const origin = siteOrigin(value), id = siteId(origin)
    return this.write(async () => {
      const existing = this.records.get(id)
      const record: SiteRecord = existing ?? { id, origin, title: new URL(origin).hostname, workspacePath: join(this.root, 'sites', id), mode: 'use' }
      await mkdir(record.workspacePath, { recursive: true })
      if (!existing) {
        const next = new Map(this.records).set(id, record)
        await this.save(next)
        this.records = next
      }
      return { ...record }
    })
  }
  async update(id: string, patch: Partial<Pick<SiteRecord, 'sessionId' | 'tabId' | 'mode'>>): Promise<SiteRecord> {
    await this.ready
    return this.write(async () => {
      if (patch.mode !== undefined && !['use', 'builder'].includes(patch.mode)) throw new Error('Invalid Browser mode.')
      if (patch.sessionId !== undefined && (!patch.sessionId || this.list().some(site => site.id !== id && site.sessionId === patch.sessionId))) {
        throw new Error('This Browser Session is already assigned to another site or has an invalid identity.')
      }
      const record = { ...this.get(id), ...patch }
      const next = new Map(this.records).set(id, record)
      await this.save(next)
      this.records = next
      return { ...record }
    })
  }
  private write<T>(action: () => Promise<T>): Promise<T> {
    const run = this.writes.then(action)
    this.writes = run.catch(() => {})
      .then(() => undefined)
    return run
  }
  private async save(records: ReadonlyMap<string, SiteRecord>): Promise<void> {
    const content = JSON.stringify([...records.values()].map(({ tabId: _tabId, ...record }) => record), null, 2)
    await mkdir(this.root, { recursive: true })
    const temporary = join(this.root, `sites.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, content, { mode: 0o600, flag: 'wx' })
      await rename(temporary, join(this.root, 'sites.json'))
    } finally { await rm(temporary, { force: true }) }
  }
}
