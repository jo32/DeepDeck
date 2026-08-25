import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppApplyStateStore } from './app-apply-state.js'

describe('AppApplyStateStore', () => {
  it('persists an applied source revision atomically across Host instances', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepdeck-app-state-'))
    const path = join(root, 'deepdeck', 'app-apply-state.json')
    const first = new AppApplyStateStore(path, 'process-a')
    await first.recordApplied({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: '/plugins/reader',
      sourceDigest: 'digest-a',
      sourceFiles: { 'index.ts': 'hash-a', 'old.ts': 'hash-old' },
      applyId: 'apply-a',
      appliedAt: '2026-08-25T01:00:00.000Z',
      outputRevision: 'output-a',
    })

    const second = new AppApplyStateStore(path, 'process-a')
    await expect(second.get('reader', '@deepdeck/reader', '/plugins/reader')).resolves.toEqual({
      status: 'applied',
      appliedDigest: 'digest-a',
      lastApplyId: 'apply-a',
      lastAppliedAt: '2026-08-25T01:00:00.000Z',
      outputRevision: 'output-a',
    })
    await expect(second.changedFiles('reader', '@deepdeck/reader', '/plugins/reader', {
      'index.ts': 'hash-b',
      'new.ts': 'hash-new',
    })).resolves.toEqual(['index.ts', 'new.ts', 'old.ts'])
    await expect(second.get('reader', '@other/reader', '/plugins/reader'))
      .rejects.toThrow('identity mismatch')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1 })
    expect((await readdir(join(root, 'deepdeck'))).filter(file => file.endsWith('.tmp'))).toEqual([])
  })

  it('does not claim a queued structural revision is active until another process registers it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepdeck-app-state-'))
    const path = join(root, 'state.json')
    const beforeRestart = new AppApplyStateStore(path, 'process-a')
    await beforeRestart.recordRestartQueued({
      appId: 'reader',
      packageName: '@deepdeck/reader',
      sourcePackageRoot: '/plugins/reader',
      sourceDigest: 'digest-pending',
      sourceFiles: { 'package.json': 'hash-pending' },
      applyId: 'apply-pending',
      appliedAt: '2026-08-25T02:00:00.000Z',
      outputRevision: 'output-pending',
    })
    await beforeRestart.promoteRestarted('reader', '@deepdeck/reader', '/plugins/reader')
    await expect(beforeRestart.get('reader', '@deepdeck/reader', '/plugins/reader')).resolves.toMatchObject({
      status: 'restart-queued',
      pendingRestartDigest: 'digest-pending',
    })

    const afterRestart = new AppApplyStateStore(path, 'process-b')
    await afterRestart.promoteRestarted('reader', '@deepdeck/reader', '/plugins/reader')
    await expect(afterRestart.get('reader', '@deepdeck/reader', '/plugins/reader')).resolves.toEqual({
      status: 'applied',
      appliedDigest: 'digest-pending',
      lastApplyId: 'apply-pending',
      lastAppliedAt: '2026-08-25T02:00:00.000Z',
      outputRevision: 'output-pending',
    })
  })

  it('fails closed when persisted state is malformed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepdeck-app-state-'))
    const path = join(root, 'state.json')
    await writeFile(path, '{"version":1,"apps":{"reader":{"status":"applied"}}}\n')

    const store = new AppApplyStateStore(path, 'process-a')
    await expect(store.get('reader', '@deepdeck/reader', '/plugins/reader')).rejects.toThrow('invalid App record')
    await expect(store.changedFiles('reader', '@deepdeck/reader', '/plugins/reader', {}))
      .rejects.toThrow('invalid App record')
  })
})
