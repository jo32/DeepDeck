import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasUsableModelProvider } from './readiness.ts'

function api(options: { codex?: boolean; deepseekConfigured?: boolean }) {
  const providers = [
    ...(options.codex ? [{
      provider: 'openai-codex', displayName: 'OpenAI Codex', settingsNs: 'llm-openai-codex', settingsPath: [], active: true,
    }] : []),
    {
      provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true,
    },
  ]
  return {
    llm: {
      providers: vi.fn(async () => ({ result: { ok: true, value: { providers } } })),
    },
    settings: {
      describe: vi.fn(async () => ({ result: { ok: true, value: {
        writable: true,
        hasDocument: true,
        namespaces: [{
          ns: 'llm-deepseek',
          schema: {},
          value: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
          applies: 'live',
          secrets: [],
          revision: 0,
        }],
      } } })),
    },
    credentials: {
      describe: vi.fn(async () => ({ result: { ok: true, value: { credentials: {
        DEEPSEEK_API_KEY: { configured: options.deepseekConfigured === true, writable: true },
      } } } })),
    },
  } as unknown as Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
}

afterEach(() => { vi.unstubAllGlobals() })

describe('hasUsableModelProvider', () => {
  it('does not mistake a mounted but signed-out Codex adapter for a usable provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'signed-out' }), { status: 200 })))
    await expect(hasUsableModelProvider(api({ codex: true }))).resolves.toBe(false)
  })

  it('accepts Codex only after its OAuth status is signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'signed-in' }), { status: 200 })))
    await expect(hasUsableModelProvider(api({ codex: true }))).resolves.toBe(true)
  })

  it('accepts a configured DeepSeek credential without consulting Codex OAuth', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(hasUsableModelProvider(api({ codex: true, deepseekConfigured: true }))).resolves.toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})
