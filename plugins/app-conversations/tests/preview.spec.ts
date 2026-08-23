import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: () => null }))

import { extractAssistantPreview } from '../src/client/index.js'

describe('app conversation preview folding', () => {
  it('prefers the durable assistant message and notices turn completion', () => {
    const preview = extractAssistantPreview([
      { event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } },
      { event: { type: 'assistant/chunk', seq: 2, time: 2, data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'part' } } } },
      { event: { type: 'assistant/message', seq: 3, time: 3, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] } } } },
      { event: { type: 'turn/end', seq: 4, time: 4, data: { turn: 1 } } },
    ] as never)

    expect(preview).toEqual({ text: 'final answer', completed: true })
  })

  it('uses live text deltas from only the latest turn', () => {
    const preview = extractAssistantPreview([
      { event: { type: 'assistant/chunk', seq: 1, time: 1, data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'old' } } } },
      { event: { type: 'turn/start', seq: 2, time: 2, data: { turn: 2 } } },
      { event: { type: 'assistant/chunk', seq: 3, time: 3, data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'new ' } } } },
      { event: { type: 'assistant/chunk', seq: 4, time: 4, data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'answer' } } } },
    ] as never)

    expect(preview).toEqual({ text: 'new answer', completed: false })
  })

  it('projects a structured turn failure instead of reporting completion', () => {
    const preview = extractAssistantPreview([
      { event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } },
      { event: { type: 'turn/end', seq: 2, time: 2, data: { turn: 1, reason: { kind: 'error', error: { message: 'Missing model credential', code: 'MISSING_CREDENTIAL' } } } } },
    ] as never)

    expect(preview).toEqual({
      text: '',
      completed: true,
      error: 'Missing model credential',
    })
  })
})
