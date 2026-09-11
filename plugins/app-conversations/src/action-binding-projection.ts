import { z } from 'zod'

const bindingSchema = z.object({
  appId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
  toolNames: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).min(1).max(16)
    .refine(names => new Set(names).size === names.length),
})
const stateSchema = z.object({
  binding: bindingSchema.nullable(),
  legacyToolSets: z.array(z.array(z.string())),
})
export type ActionBindingState = z.infer<typeof stateSchema>

/** Host-only fold: restore action bindings without retaining or rescanning Session events. */
export const actionBindingProjection = {
  key: 'deepdeck-app-action-binding',
  stateVersion: 1,
  stateSchema,
  init: (): ActionBindingState => ({ binding: null, legacyToolSets: [] }),
  apply(state: ActionBindingState, event: { readonly type: string; readonly data: unknown }): ActionBindingState {
    if (event.type === 'deepdeck/app-action-binding') {
      const parsed = bindingSchema.safeParse(event.data)
      return { binding: parsed.success ? parsed.data : null, legacyToolSets: state.legacyToolSets }
    }
    if (event.type !== 'request/header' || state.binding !== null) return state
    const parsed = z.object({ header: z.object({ tools: z.array(z.object({ name: z.string() })) }) }).safeParse(event.data)
    const names = parsed.success ? parsed.data.header.tools.map(tool => tool.name) : []
    if (names.length === 0) return state
    // Legacy requests can contain different tool sets. Keep each distinct candidate
    // in recency order until the explicit binding migration has been persisted.
    return { ...state, legacyToolSets: [names, ...state.legacyToolSets.filter(previous =>
      previous.length !== names.length || previous.some((name, index) => name !== names[index]))] }
  },
}
