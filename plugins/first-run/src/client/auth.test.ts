import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { describe, expect, it, vi } from 'vitest'
import { configureDeepSeek } from './auth.ts'

describe('configureDeepSeek', () => {
  it('stores the key write-only and selects the provider-preferred model', async () => {
    const set = vi.fn(async () => ({ result: { ok: true, value: {} } }))
    const mutate = vi.fn(async () => ({ result: { ok: true, value: {} } }))
    const models = vi.fn(async () => ({ result: { ok: true, value: {
      groups: [{ id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash', name: 'V4 Flash' }] }],
      failures: [],
    } } }))
    const api = {
      credentials: { set },
      settings: { mutate },
      llm: { models },
    } as unknown as Pick<IApiClient, 'settings' | 'credentials' | 'llm'>

    await configureDeepSeek(api, 'sk-test-secret')

    expect(set).toHaveBeenCalledWith({ ref: 'DEEPSEEK_API_KEY', value: 'sk-test-secret' })
    expect(mutate).toHaveBeenCalledWith({
      ns: 'agent-default-model',
      ops: [
        { op: 'set', path: ['provider'], value: 'deepseek-official' },
        { op: 'set', path: ['model'], value: 'deepseek-v4-flash' },
        { op: 'unset', path: ['reasoningEffort'] },
      ],
    })
  })
})
