import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: () => null }))

import {
  DefaultAppConversationClientRegistry,
  dispatchAppUpdateTask,
  openCreatorSession,
} from '../src/client/index.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('app conversation Client registry', () => {
  it('opens an App source Workspace with the cordis Creator preset', async () => {
    const open = vi.fn()
    const noteAgentPreset = vi.fn()
    const create = vi.fn(async () => ({
      result: { ok: true, value: { sessionId: 'session-creator', agentPreset: 'cordis' } },
    }))
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string }
      return new Response(JSON.stringify(request.action === 'creator-ready'
        ? {
            creator: {
              protocolVersion: 3,
              sessionId: 'session-creator',
              appId: 'reader',
              agentPreset: 'cordis',
              sourcePackageRoot: '/plugins/reader',
              tools: [
                'deepdeck_app_context',
                'deepdeck_app_apply',
                'deepdeck_app_rebuild',
                'deepdeck_app_restart',
              ],
              skills: ['deepdeck-vibe-app-development'],
            },
          }
        : {
            workspace: {
              appId: 'reader',
              path: '/plugins/reader',
              title: 'Creator · Reader',
              workspaceId: 'workspace-creator',
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await openCreatorSession({
      workspaces: {
        list: { getSnapshot: () => ({ items: [] }) },
        create: vi.fn(async () => ({ workspaceId: 'workspace-creator', path: '/plugins/reader', sessionIds: [] })),
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
    } as never, { api: { sessions: { create } } } as never, 'reader')

    expect(create).toHaveBeenCalledWith({ workspaceId: 'workspace-creator', agentPreset: 'cordis' })
    expect(noteAgentPreset).toHaveBeenCalledWith('session-creator', 'cordis')
    expect(open).toHaveBeenCalledWith('session-creator')
  })

  it('reuses a blank session atomically but refuses to open it without Host guard readiness', async () => {
    const open = vi.fn()
    const create = vi.fn(async () => ({
      result: { ok: true, value: { sessionId: 'session-blank', agentPreset: 'cordis' } },
    }))
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string }
      return new Response(JSON.stringify(request.action === 'creator-ready'
        ? {
            creator: {
              protocolVersion: 3,
              sessionId: 'session-blank',
              appId: 'reader',
              agentPreset: 'cordis',
              sourcePackageRoot: '/plugins/reader',
              tools: ['deepdeck_app_context'],
              skills: ['deepdeck-vibe-app-development'],
            },
          }
        : {
            workspace: {
              appId: 'reader',
              path: '/plugins/reader',
              title: 'Creator · Reader',
              workspaceId: 'workspace-creator',
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await expect(openCreatorSession({
      workspaces: {
        list: { getSnapshot: () => ({
          items: [{
            workspaceId: 'workspace-creator',
            path: '/plugins/reader',
            sessionIds: ['session-blank'],
          }],
        }) },
      },
      sessions: {
        list: { getSnapshot: () => ({
          archivedSessionIds: [],
          byId: {
            'session-blank': {
              id: 'session-blank',
              blank: true,
              cwd: '/plugins/reader',
              agentPreset: 'cordis',
            },
          },
        }) },
        noteAgentPreset: vi.fn(),
        open,
      },
    } as never, { api: { sessions: { create } } } as never, 'reader'))
      .rejects.toThrow('did not confirm')
    expect(create).toHaveBeenCalledWith({
      workspaceId: 'workspace-creator',
      sessionId: 'session-blank',
      reuseWorkspaceBlank: true,
      agentPreset: 'cordis',
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('does not adopt a standard-preset blank session for Creator mode', async () => {
    const open = vi.fn()
    const create = vi.fn(async () => ({
      result: { ok: true, value: { sessionId: 'session-creator', agentPreset: 'cordis' } },
    }))
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string }
      return new Response(JSON.stringify(request.action === 'creator-ready'
        ? {
            creator: {
              protocolVersion: 3,
              sessionId: 'session-creator',
              appId: 'reader',
              agentPreset: 'cordis',
              sourcePackageRoot: '/plugins/reader',
              tools: [
                'deepdeck_app_context',
                'deepdeck_app_apply',
                'deepdeck_app_rebuild',
                'deepdeck_app_restart',
              ],
              skills: ['deepdeck-vibe-app-development'],
            },
          }
        : {
            workspace: {
              appId: 'reader',
              path: '/plugins/reader',
              title: 'Creator · Reader',
              workspaceId: 'workspace-creator',
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await openCreatorSession({
      workspaces: {
        list: { getSnapshot: () => ({
          items: [{
            workspaceId: 'workspace-creator',
            path: '/plugins/reader',
            sessionIds: ['session-standard'],
          }],
        }) },
      },
      sessions: {
        list: { getSnapshot: () => ({
          archivedSessionIds: [],
          byId: {
            'session-standard': {
              id: 'session-standard',
              blank: true,
              cwd: '/plugins/reader',
              agentPreset: 'standard',
            },
          },
        }) },
        noteAgentPreset: vi.fn(),
        open,
      },
    } as never, { api: { sessions: { create } } } as never, 'reader')

    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({
      workspaceId: 'workspace-creator',
      agentPreset: 'cordis',
    })
    expect(open).toHaveBeenCalledWith('session-creator')
  })

  it('creates a fresh Creator session when a reusable blank races to another preset', async () => {
    const open = vi.fn()
    const create = vi.fn()
      .mockResolvedValueOnce({
        result: {
          ok: false,
          error: {
            code: 'agent-preset-conflict',
            message: 'session already runs agent preset "standard"',
            details: {
              sessionId: 'session-blank',
              requestedPreset: 'cordis',
              existingPreset: 'standard',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        result: { ok: true, value: { sessionId: 'session-fresh', agentPreset: 'cordis' } },
      })
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string }
      return new Response(JSON.stringify(request.action === 'creator-ready'
        ? {
            creator: {
              protocolVersion: 3,
              sessionId: 'session-fresh',
              appId: 'reader',
              agentPreset: 'cordis',
              sourcePackageRoot: '/plugins/reader',
              tools: [
                'deepdeck_app_context',
                'deepdeck_app_apply',
                'deepdeck_app_rebuild',
                'deepdeck_app_restart',
              ],
              skills: ['deepdeck-vibe-app-development'],
            },
          }
        : {
            workspace: {
              appId: 'reader',
              path: '/plugins/reader',
              title: 'Creator · Reader',
              workspaceId: 'workspace-creator',
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await openCreatorSession({
      workspaces: {
        list: { getSnapshot: () => ({
          items: [{
            workspaceId: 'workspace-creator',
            path: '/plugins/reader',
            sessionIds: ['session-blank'],
          }],
        }) },
      },
      sessions: {
        list: { getSnapshot: () => ({
          archivedSessionIds: [],
          byId: {
            'session-blank': {
              id: 'session-blank',
              blank: true,
              cwd: '/plugins/reader',
              agentPreset: 'cordis',
            },
          },
        }) },
        noteAgentPreset: vi.fn(),
        open,
      },
    } as never, { api: { sessions: { create } } } as never, 'reader')

    expect(create).toHaveBeenNthCalledWith(1, {
      workspaceId: 'workspace-creator',
      sessionId: 'session-blank',
      reuseWorkspaceBlank: true,
      agentPreset: 'cordis',
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      workspaceId: 'workspace-creator',
      agentPreset: 'cordis',
    })
    expect(open).toHaveBeenCalledWith('session-fresh')
  })

  it('dispatches a dedicated cordis Agent task with source provenance and diff-first instructions', async () => {
    const prompt = vi.fn(async () => ({ ok: true }))
    const rename = vi.fn(async () => ({ ok: true }))
    const open = vi.fn()
    const create = vi.fn(async () => ({
      result: { ok: true, value: { sessionId: 'session-update', agentPreset: 'cordis' } },
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
        : request.action === 'creator-ready'
          ? {
              creator: {
                protocolVersion: 3,
                sessionId: 'session-update',
                appId: 'reader',
                agentPreset: 'cordis',
                sourcePackageRoot: '/plugins/reader',
                tools: [
                  'deepdeck_app_context',
                  'deepdeck_app_apply',
                  'deepdeck_app_rebuild',
                  'deepdeck_app_restart',
                ],
                skills: ['deepdeck-vibe-app-development'],
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
        create: vi.fn(async () => ({ workspaceId: 'workspace-update', path: '/plugins/reader', sessionIds: [] })),
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
    } as never, { api: { sessions: { create } } } as never, 'reader')

    expect(rename).toHaveBeenCalledWith('Update Reader')
    expect(prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'text',
        text: expect.stringMatching(/https:\/\/example\.com\/reader\.git[\s\S]*Git status[\s\S]*local diff[\s\S]*Never use reset --hard[\s\S]*deepdeck_app_apply[\s\S]*durably saved/u),
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

  it('delivers action-scoped tool effects instead of treating final text as App data', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout })
    const prompt = vi.fn(async () => ({ ok: true }))
    const publish = vi.fn()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string }
      requests.push(request.action)
      if (request.action === 'resolve-workspace') {
        return new Response(JSON.stringify({
          workspace: {
            appId: 'reader',
            path: '/tmp/deepdeck-reader',
            title: 'Apps · Reader',
            workspaceId: 'workspace-1',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (request.action === 'begin-agent-action') {
        return new Response(JSON.stringify({
          execution: {
            executionId: 'execution-1',
            sessionId: 'session-1',
            appId: 'reader',
            tools: ['reader_set_reply_draft'],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (request.action === 'read-agent-action-effects') {
        return new Response(JSON.stringify({
          effectPage: {
            executionId: 'execution-1',
            effects: [{
              sequence: 1,
              effectId: 'effect-1',
              toolName: 'reader_set_reply_draft',
              effect: 'reply-draft.set',
              payload: { content: 'Structured draft' },
              createdAt: '2026-08-29T00:00:00.000Z',
            }],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ finished: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))
    const history = vi.fn()
      .mockResolvedValueOnce({ result: { ok: true, value: { events: [] } } })
      .mockResolvedValue({
        result: {
          ok: true,
          value: {
            events: [
              { event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } },
              { event: { type: 'assistant/message', seq: 2, time: 2, data: { message: { content: [{ type: 'text', text: 'Draft applied.' }] } } } },
              { event: { type: 'turn/end', seq: 3, time: 3, data: { reason: { kind: 'completed' } } } },
            ],
          },
        },
      })
    const registry = new DefaultAppConversationClientRegistry({
      workspaces: {
        list: { getSnapshot: () => ({ items: [] }) },
        create: vi.fn(async () => ({ workspaceId: 'workspace-1', path: '/tmp/deepdeck-reader' })),
        connectWorkspace: vi.fn(async () => 'session-1'),
      },
      sessions: {
        list: { getSnapshot: () => ({ byId: { 'session-1': { running: false } } }) },
        binding: () => ({ session: { rename: vi.fn(async () => ({ ok: true })), prompt } }),
        open: vi.fn(),
      },
    } as never, { api: { sessions: { history } } } as never, publish)
    registry.register({
      id: 'reader',
      actions: {
        reply: () => ({
          prompt: 'Draft the reply and call reader_set_reply_draft.',
          title: 'Draft reply',
          tools: ['reader_set_reply_draft'],
        }),
      },
    })

    expect(registry.accept({
      source: 'deepdeck-app-page',
      type: 'invoke',
      clientId: 'client-1',
      requestId: 'request-1',
      appId: 'reader',
      actionId: 'reply',
      payload: {},
      openSession: false,
    })).toBe(true)
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(0)

    expect(prompt).toHaveBeenCalledWith([
      { type: 'text', text: 'Draft the reply and call reader_set_reply_draft.' },
    ], 'queue')
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action-effect',
      requestId: 'request-1',
      effect: expect.objectContaining({
        effect: 'reply-draft.set',
        payload: { content: 'Structured draft' },
      }),
    }))
    expect(requests).toContain('finish-agent-action')
  })
})
