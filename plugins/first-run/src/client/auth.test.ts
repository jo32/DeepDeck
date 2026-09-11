import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { describe, expect, it, vi } from 'vitest'
import { configureDeepSeek } from './auth.ts'

describe('configureDeepSeek', () => {
  it('stores the key write-only and selects the provider-preferred model', async () => {
    const set = vi.fn(async () => ({ ok: true, value: undefined }))
    const mutate = vi.fn(async () => ({ ok: true, value: undefined }))
    const models = vi.fn(async () => ({ ok: true, value: {
      groups: [{ id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash', name: 'V4 Flash' }] }],
      failures: [],
    } }))
    const api = {
      credentials: { set },
      settings: { mutate },
      session: { modelCatalog: models },
    } as unknown as Pick<ClientRemote, 'settings' | 'credentials' | 'session'>

    await configureDeepSeek(api, 'sk-test-secret')

    expect(set).toHaveBeenCalledWith('DEEPSEEK_API_KEY', 'sk-test-secret')
    expect(mutate).toHaveBeenCalledWith('agent-default-model', [
        { op: 'set', path: ['provider'], value: 'deepseek-official' },
        { op: 'set', path: ['model'], value: 'deepseek-v4-flash' },
        { op: 'unset', path: ['reasoningEffort'] },
      ], undefined)
  })
})
