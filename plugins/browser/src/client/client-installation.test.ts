import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SlotCore } from '../../../../vendor/deepseek-harness/packages/client/ui-slots/lib/index.js'
import { apply } from './index.js'
import { BrowserSessionHeader } from './BrowserSessionHeader.js'

afterEach(() => vi.unstubAllGlobals())

describe('Browser Client Cordis assembly', () => {
  function install(url: string) {
    const overrideTokens = vi.fn(() => () => {})
    const character = { Icon: () => null, Character: () => null }
    const homeHero = () => null
    vi.stubGlobal('window', { location: { href: url } })
    const core = new SlotCore()
    core.register({ name: 'root', children: {
      conversation: { kind: 'single', scope: 'session-maybe' },
      'desktop.surface': { kind: 'single', scope: 'root' },
      'sidebar.launchers': { kind: 'list', scope: 'root' },
      'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
    } }, () => null)
    core.register({ name: 'conversation', children: {
      'conversation.session.header': { kind: 'single', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
      'conversation.input.right': { kind: 'list', scope: 'session' },
    } }, () => null)
    core.register({ name: 'conversation.input.dock', id: 'deepdeck-home-hero' }, homeHero)
    core.register({ name: 'conversation.session.header', store: {} as never, children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    } }, () => null)
    const ctx = {
      slots: { register: core.register.bind(core), entries: core.entries.bind(core), subscribe: core.subscribe.bind(core), inject: (_name: string, setup: () => unknown) => setup() },
      locale: { register: () => () => {} },
      theme: { overrideTokens },
      get: (name: string) => name === 'deepdeckCharacter' ? character : {},
      effect: (setup: () => unknown) => setup(),
    } as unknown as ClientContext
    apply(ctx)
    return { core, overrideTokens, character, homeHero }
  }

  it('mounts a standalone surface alongside the root-owned conversation outlet', () => {
    const { core, overrideTokens, character, homeHero } = install('http://127.0.0.1:5000/?deepdeck-surface=browser')
    expect(overrideTokens).toHaveBeenCalledOnce()
    expect(core.entriesOfSlot('desktop.surface')).toHaveLength(1)
    expect(core.entriesOfSlot('sidebar.launchers')).toHaveLength(1)
    expect(core.spec('conversation')).toMatchObject({ kind: 'single', scope: 'session-maybe' })
    expect(core.entries('conversation')).toHaveLength(1)
    const headers = core.entries('conversation.session.header')
    expect(core.entriesOfSlot('conversation.session.header')[0]?.component).toBe(BrowserSessionHeader)
    expect(headers[0]?.store).toBe(headers[1]?.store)
    expect(core.entries('conversation.input.dock')).toHaveLength(3)
    expect(core.entriesOfSlot('conversation.input.dock').find(entry => entry.options.id === 'deepdeck-home-hero')?.component).toBe(homeHero)
    expect(core.entriesOfSlot('conversation.hero.brand.mark')[0]?.component).toBe(character.Icon)
  })

  it('contributes only a launcher in a normal desktop window', () => {
    const { core, overrideTokens } = install('http://127.0.0.1:5000/')
    expect(overrideTokens).not.toHaveBeenCalled()
    expect(core.entriesOfSlot('desktop.surface')).toHaveLength(0)
    expect(core.entriesOfSlot('sidebar.launchers')).toHaveLength(1)
    expect(core.entries('conversation.session.header')).toHaveLength(1)
  })
})
