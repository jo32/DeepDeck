import { describe, expect, it } from 'vitest'
import { Context } from '../../../vendor/deepseek-harness/vendor/cordis/lib/index.js'
import SessionStore from '../../../vendor/deepseek-harness/packages/core/session/lib/index.js'
import SessionProjectionRegistry from '../../../vendor/deepseek-harness/packages/session/session-projection/lib/index.js'
import { actionBindingProjection } from '../../../plugins/app-conversations/src/action-binding-projection.js'

// Use the real Harness Session shape so a mock cannot hide removed log APIs.
describe('App action binding with the current Harness', () => {
  it('restores bindings after projection remount and tracks later committed changes', async () => {
    const ctx = new Context()
    const store = ctx.plugin(SessionStore)
    await store
    const projections = ctx.plugin(SessionProjectionRegistry)
    await projections
    try {
      const session = ctx.sessions.create()
      expect('events' in session).toBe(false)
      const binding = { appId: 'reader', toolNames: ['reader_set_reply_draft'] }
      session.append('deepdeck/app-action-binding', binding)
      const stop = ctx.sessionProjections.register(actionBindingProjection)
      expect(ctx.sessionProjections.stateOf(session, actionBindingProjection.key)?.binding).toEqual(binding)
      stop()
      ctx.sessionProjections.register(actionBindingProjection)
      expect(ctx.sessionProjections.stateOf(session, actionBindingProjection.key)?.binding).toEqual(binding)
      const next = { appId: 'reader', toolNames: ['reader_open_topic'] }
      session.append('deepdeck/app-action-binding', next)
      expect(ctx.sessionProjections.stateOf(session, actionBindingProjection.key)?.binding).toEqual(next)
      // Invalid durable bindings never reinstall tools.
      session.append('deepdeck/app-action-binding', { appId: 'reader', toolNames: [] })
      expect(ctx.sessionProjections.stateOf(session, actionBindingProjection.key)?.binding).toBeNull()
    } finally { await projections.dispose(); await store.dispose() }
  })
})
