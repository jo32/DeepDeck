import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, type ComponentType } from 'react'
import { BROWSER_LOCALE } from './locales.js'
import { BrowserComposerModel, BrowserComposerOverflow, COMPOSER_CONTROLS, COMPOSER_CONTROL_LABELS } from './BrowserComposerOverflow.js'

function HiddenControl() { return null }

/** Move known utility entries through public Cordis registration, preserving their entire injected face. */
export function installComposerOverflow(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.model', () => {
    let source: StoredEntry | undefined
    let wrapper: ComponentType<Record<string, unknown>> | undefined
    let dispose = () => {}
    const sync = () => {
      const next = ctx.slots.entries('conversation.input.model').find(entry => entry.component !== wrapper)
      if (next === source) return
      dispose()
      source = next
      if (!next) return
      const Original = next.component as ComponentType<Record<string, unknown>>
      wrapper = (props) => createElement(BrowserComposerModel, null, createElement(Original, props))
      // Wrap the public seat itself, forwarding all owner and injected props.
      // The editor still computes `locked`; no model state is duplicated here.
      const register = ctx.slots.register.bind(ctx.slots) as unknown as (options: StoredEntry['options'] & { name: 'conversation.input.model' } & Pick<StoredEntry, 'inject' | 'store' | 'locale' | 'children'>, component: unknown) => () => void
      dispose = register({ ...next.options, name: 'conversation.input.model', priority: (next.options.priority ?? 0) - 1,
        ...(next.inject ? { inject: next.inject } : {}), ...(next.store ? { store: next.store } : {}),
        ...(next.locale ? { locale: next.locale } : {}), ...(next.children ? { children: next.children } : {}),
      }, wrapper)
    }
    const unsubscribe = ctx.slots.subscribe('conversation.input.model', sync)
    sync()
    return () => { unsubscribe(); dispose() }
  })
  ctx.slots.inject('conversation.input.right', () => {
    const disposeContainer = ctx.slots.register({
      name: 'conversation.input.right', id: 'deepdeck-browser-more', order: 0, locale: BROWSER_LOCALE,
      children: { [COMPOSER_CONTROLS]: { kind: 'list', scope: 'session' } },
    }, BrowserComposerOverflow)
    const moved = new Map<string, { source: StoredEntry; dispose(): void }>()
    // StoredEntry is the registry's type-erased composition boundary. Both seats
    // have exactly the same session scope and owner props; no state is copied.
    const registerControl = ctx.slots.register.bind(ctx.slots) as unknown as (
      options: Pick<StoredEntry, 'inject' | 'store' | 'locale'> & { name: typeof COMPOSER_CONTROLS; id: string },
      component: unknown,
    ) => () => void
    const sync = () => {
      const entries = ctx.slots.entries('conversation.input.right')
      for (const id of Object.keys(COMPOSER_CONTROL_LABELS)) {
        const source = entries.find(entry => entry.options.id === id && entry.component !== HiddenControl)
        const previous = moved.get(id)
        if (previous?.source === source) continue
        previous?.dispose()
        moved.delete(id)
        if (!source) continue
        // These controls are leaves. A future upstream control with child seats
        // keeps its original location instead of losing render authorization.
        if (source.children && Object.keys(source.children).length) continue
        const disposeControl = registerControl({ name: COMPOSER_CONTROLS, id,
          ...(source.inject ? { inject: source.inject } : {}),
          ...(source.store ? { store: source.store } : {}),
          ...(source.locale ? { locale: source.locale } : {}),
        }, source.component)
        const disposeShadow = ctx.slots.register({ name: 'conversation.input.right', id,
          priority: (source.options.priority ?? 0) - 1,
        }, HiddenControl)
        moved.set(id, { source, dispose: () => { disposeShadow(); disposeControl() } })
      }
    }
    const unsubscribe = ctx.slots.subscribe('conversation.input.right', sync)
    sync()
    return () => {
      unsubscribe()
      for (const entry of moved.values()) entry.dispose()
      disposeContainer()
    }
  })
}
