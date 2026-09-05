import { describe, expect, it } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SlotCore } from '../../../../vendor/deepseek-harness/packages/client/ui-slots/lib/index.js'
import { installComposerOverflow } from './composer-overflow.js'
import { COMPOSER_CONTROLS } from './BrowserComposerOverflow.js'

function setup() {
  const core = new SlotCore()
  core.register({ name: 'root', children: { 'conversation.input.right': { kind: 'list', scope: 'session' }, 'conversation.input.model': { kind: 'single', scope: 'session' } } }, () => null)
  const disposers: (() => void)[] = []
  const ctx = { slots: {
    register: core.register.bind(core), entries: core.entries.bind(core), subscribe: core.subscribe.bind(core),
    inject: (_name: string, install: () => () => void) => { disposers.push(install()) },
  } } as unknown as ClientContext
  return { core, install: () => { installComposerOverflow(ctx) }, dispose: () => { for (const dispose of disposers) dispose() } }
}

describe('Browser composer overflow assembly', () => {
  it('wraps the model seat with its original business face and restores it on unload', () => {
    const fixture = setup()
    const Original = () => null
    const store = {} as never
    const inject = () => ({ locked: true, directory: {}, select: () => false })
    fixture.core.register({ name: 'conversation.input.model', locale: 'deepdeck.browser', store, inject }, Original)
    fixture.install()
    const winner = fixture.core.entriesOfSlot('conversation.input.model')[0]
    expect(winner?.component).not.toBe(Original)
    expect(winner).toMatchObject({ store, inject, locale: 'deepdeck.browser' })
    fixture.dispose()
    expect(fixture.core.entriesOfSlot('conversation.input.model')[0]?.component).toBe(Original)
  })

  it('preserves the original control, injected actions, store and locale; restores it on disposal', () => {
    const fixture = setup()
    const { core } = fixture
    const store = {} as never
    const inject = () => ({ action: () => 'original action' })
    const Control = () => null
    core.register({ name: 'conversation.input.right', id: 'deepdeck-session-metrics', locale: 'deepdeck.browser', store, inject }, Control)
    core.register({ name: 'conversation.input.right', id: 'unrelated-control' }, Control)
    fixture.install()
    const moved = core.entries(COMPOSER_CONTROLS)[0]
    expect(moved).toMatchObject({ component: Control, inject, store, locale: 'deepdeck.browser' })
    expect(core.entriesOfSlot('conversation.input.right').find(entry => entry.options.id === 'deepdeck-session-metrics')?.component).not.toBe(Control)
    expect(core.entriesOfSlot('conversation.input.right').find(entry => entry.options.id === 'unrelated-control')?.component).toBe(Control)
    fixture.dispose()
    expect(core.entriesOfSlot('conversation.input.right').find(entry => entry.options.id === 'deepdeck-session-metrics')?.component).toBe(Control)
    expect(core.spec(COMPOSER_CONTROLS)).toBeUndefined()
  })

  it('tracks late registration, unloading, and replacement without retaining stale controls', async () => {
    const fixture = setup()
    fixture.install()
    const Control = () => null
    const unregister = fixture.core.register({ name: 'conversation.input.right', id: 'openai-codex-fast-mode' }, Control)
    await Promise.resolve()
    expect(fixture.core.entries(COMPOSER_CONTROLS)[0]?.component).toBe(Control)
    unregister()
    await Promise.resolve()
    expect(fixture.core.entries(COMPOSER_CONTROLS)).toHaveLength(0)
    expect(fixture.core.entries('conversation.input.right').filter(entry => entry.options.id === 'openai-codex-fast-mode')).toHaveLength(0)
    const Replacement = () => null
    fixture.core.register({ name: 'conversation.input.right', id: 'openai-codex-fast-mode' }, Replacement)
    await Promise.resolve()
    expect(fixture.core.entries(COMPOSER_CONTROLS)[0]?.component).toBe(Replacement)
    fixture.dispose()
  })
})
