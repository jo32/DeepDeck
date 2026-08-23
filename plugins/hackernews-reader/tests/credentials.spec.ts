import { describe, expect, it } from 'vitest'
import {
  clearHackerNewsCredentials,
  hackerNewsCredentialKey,
  parseHackerNewsCredentialRecord,
  readHackerNewsCredentials,
  writeHackerNewsCredentials,
  type CredentialRecordStore,
} from '../src/credentials.js'

function memoryStore(): CredentialRecordStore & { records: Map<string, unknown> } {
  const records = new Map<string, unknown>()
  return {
    records,
    async readRecord(key) { return records.get(key) },
    async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key))
      if (next === undefined) records.delete(key)
      else records.set(key, next)
      return next
    },
    async deleteRecord(key) { records.delete(key) },
  }
}

describe('Hacker News credential records', () => {
  it('stores the session cookie in a versioned grant and reads it back', async () => {
    const store = memoryStore()
    const credentials = { username: 'alice', cookie: 'alice%26token' }

    await expect(writeHackerNewsCredentials(store, credentials)).resolves.toEqual(credentials)
    expect(store.records.get(hackerNewsCredentialKey)).toEqual({
      kind: 'grant',
      payload: { version: 1, username: 'alice', cookie: 'alice%26token' },
    })
    await expect(readHackerNewsCredentials(store)).resolves.toEqual(credentials)
  })

  it('clears the local session and rejects malformed records', async () => {
    const store = memoryStore()
    await writeHackerNewsCredentials(store, { username: 'alice', cookie: 'cookie' })
    await clearHackerNewsCredentials(store)

    await expect(readHackerNewsCredentials(store)).resolves.toBeNull()
    expect(() => parseHackerNewsCredentialRecord({ kind: 'grant', payload: { version: 2 } }))
      .toThrow('unsupported Hacker News credential record version')
  })
})
