export interface HackerNewsCredentials {
  readonly username: string
  readonly cookie: string
}

export interface CredentialRecordStore {
  readRecord(key: string): Promise<unknown>
  modifyRecord(
    key: string,
    mutate: (current: unknown) => Promise<unknown>,
  ): Promise<unknown>
  deleteRecord(key: string): Promise<void>
}

export const hackerNewsCredentialKey = 'dsh-hackernews-reader-plugin/hacker-news-account'

const credentialRecordVersion = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeHackerNewsCredentials(
  username: unknown,
  cookie: unknown,
): HackerNewsCredentials {
  const normalized = {
    username: String(username ?? '').trim(),
    cookie: String(cookie ?? '').trim(),
  }
  if (!normalized.username || !normalized.cookie) {
    throw new Error('both Hacker News username and session cookie are required')
  }
  if (normalized.username.length > 64 || /[\u0000-\u001f\u007f]/u.test(normalized.username)) {
    throw new Error('invalid Hacker News username')
  }
  if (normalized.cookie.length > 8_192 || /[\r\n;]/u.test(normalized.cookie)) {
    throw new Error('invalid Hacker News session cookie')
  }
  return normalized
}

export function parseHackerNewsCredentialRecord(record: unknown): HackerNewsCredentials | null {
  if (record === undefined) return null
  if (!isRecord(record) || record.kind !== 'grant' || !isRecord(record.payload)) {
    throw new Error('Hacker News credential record has an invalid shape')
  }
  if (record.payload.version !== credentialRecordVersion) {
    throw new Error('unsupported Hacker News credential record version')
  }
  return normalizeHackerNewsCredentials(record.payload.username, record.payload.cookie)
}

export async function readHackerNewsCredentials(
  store: CredentialRecordStore,
): Promise<HackerNewsCredentials | null> {
  return parseHackerNewsCredentialRecord(await store.readRecord(hackerNewsCredentialKey))
}

export async function writeHackerNewsCredentials(
  store: CredentialRecordStore,
  credentials: HackerNewsCredentials,
): Promise<HackerNewsCredentials> {
  const normalized = normalizeHackerNewsCredentials(credentials.username, credentials.cookie)
  await store.modifyRecord(hackerNewsCredentialKey, async () => ({
    kind: 'grant',
    payload: {
      version: credentialRecordVersion,
      username: normalized.username,
      cookie: normalized.cookie,
    },
  }))
  return normalized
}

export async function clearHackerNewsCredentials(store: CredentialRecordStore): Promise<void> {
  await store.deleteRecord(hackerNewsCredentialKey)
}
