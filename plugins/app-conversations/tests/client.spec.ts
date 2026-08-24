import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: () => null }))

import {
  DefaultAppConversationClientRegistry,
  dispatchAppUpdateTask,
  openCreatorSession,
} from '../src/client/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app conversation Client registry', () => {
  it('opens an App source Workspace with the cordis Creator preset', async () => {
    const open = vi.fn()
    const noteAgentPreset = vi.fn()
    const select = vi.fn(async () => ({
      result: { ok: true, value: { agentPreset: 'cordis' } },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      workspace: {
        appId: 'reader',
        path: '/plugins/reader',
        title: 'Creator · Reader',
        workspaceId: 'workspace-creator',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await openCreatorSession({
      workspaces: {
        list: { getSnapshot: () => ({ items: [] }) },
        create: vi.fn(async () => ({ workspaceId: 'workspace-creator', path: '/plugins/reader' })),
        connectWorkspace: vi.fn(async () => 'session-creator'),
      },
      sessions: {
        list: { getSnapshot: () => ({
          byId: {
            'session-creator': {
              id: 'session-creator',
              blank: true,
              cwd: '/plugins/reader',
              agentPreset: 'standard',
            },
          },
        }) },
        noteAgentPreset,
        open,
      },
    } as never, { api: { agentPresets: { select } } } as never, 'reader')

    expect(select).toHaveBeenCalledWith({ sessionId: 'session-creator', agentPreset: 'cordis' })
    expect(noteAgentPreset).toHaveBeenCalledWith('session-creator', 'cordis')
    expect(open).toHaveBeenCalledWith('session-creator')
  })

  it('dispatches a dedicated cordis Agent task with source provenance and diff-first instructions', async () => {
    const prompt = vi.fn(async () => ({ ok: true }))
    const rename = vi.fn(async () => ({ ok: true }))
    const open = vi.fn()
    const select = vi.fn(async () => ({
      result: { ok: true, value: { agentPreset: 'cordis' } },
    }))
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string }
      return new Response(JSON.stringify(request.action === 'resolve-creator-workspace'
        ? {
            workspace: {
              appId: 'reader',
              path: '/plugins/reader',
              title: 'Creator · Reader',
              workspaceId: 'workspace-update',
            },
          }
        : {
            updateContext: {
              appId: 'reader',
              title: 'Reader',
              packageName: '@fixture/reader',
              sourceDirectory: '/plugins/reader',
              sourceKind: 'git-repository',
              source: 'https://example.com/reader.git',
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await dispatchAppUpdateTask({
      workspaces: {
        list: { getSnapshot: () => ({ items: [] }) },
        create: vi.fn(async () => ({ workspaceId: 'workspace-update', path: '/plugins/reader' })),
        connectWorkspace: vi.fn(async () => 'session-update'),
      },
      sessions: {
        list: { getSnapshot: () => ({
          byId: {
            'session-update': {
              id: 'session-update',
              blank: true,
              cwd: '/plugins/reader',
              agentPreset: 'standard',
            },
          },
        }) },
        noteAgentPreset: vi.fn(),
        binding: () => ({ session: { rename, prompt } }),
        open,
      },
    } as never, { api: { agentPresets: { select } } } as never, 'reader')

    expect(rename).toHaveBeenCalledWith('Update Reader')
    expect(prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'text',
        text: expect.stringMatching(/https:\/\/example\.com\/reader\.git[\s\S]*Git status[\s\S]*local diff[\s\S]*Never use reset --hard[\s\S]*deepdeck_app_rebuild[\s\S]*deepdeck_app_restart/u),
      }),
    ], 'queue')
    expect(open).toHaveBeenCalledWith('session-update')
  })

  it('opens a direct-jump Session after its prompt is accepted', async () => {
    const open = vi.fn()
    const prompt = vi.fn(async () => ({ ok: true }))
    const history = vi.fn()
    const publish = vi.fn()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return new Response(JSON.stringify(url.endsWith('/api/deepdeck/app-conversations')
        ? {
            workspace: {
              appId: 'reader',
              path: '/tmp/deepdeck-reader',
              title: 'Apps · Reader',
              workspaceId: 'workspace-1',
            },
          }
        : {}), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const registry = new DefaultAppConversationClientRegistry({
      workspaces: {
        list: { getSnapshot: () => ({ items: [] }) },
        create: vi.fn(async () => ({ workspaceId: 'workspace-1', path: '/tmp/deepdeck-reader' })),
        connectWorkspace: vi.fn(async () => 'session-1'),
      },
      sessions: {
        list: { getSnapshot: () => ({ byId: {} }) },
        binding: () => ({
          session: {
            rename: vi.fn(async () => ({ ok: true })),
            prompt,
          },
        }),
        open,
      },
    } as never, { api: { sessions: { history } } } as never, publish)
    registry.register({
      id: 'reader',
      actions: {
        explain: () => ({ prompt: 'Explain this', title: 'Explain', sessionTitle: 'Reader explanation' }),
      },
    })

    expect(registry.accept({
      source: 'deepdeck-app-page',
      type: 'invoke',
      clientId: 'client-1',
      requestId: 'request-1',
      appId: 'reader',
      actionId: 'explain',
      payload: {},
      openSession: true,
    })).toBe(true)

    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('session-1'))
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'Explain this' }], 'queue')
    expect(history).not.toHaveBeenCalled()
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'running',
      sessionId: 'session-1',
    }))
  })
})
