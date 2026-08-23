import { describe, expect, it } from 'vitest'
import { prepareHackerNewsAction } from '../src/app-actions.js'

const story = {
  storyId: 42,
  title: 'A useful discussion',
  url: 'https://example.com/article',
  hnUrl: 'https://news.ycombinator.com/item?id=42',
  selection: '',
}

describe('Hacker News app conversation actions', () => {
  it('grounds a whole-discussion summary in the Reader tool', () => {
    const action = prepareHackerNewsAction('summarize', story)

    expect(action.sessionTitle).toBe('[HN] Summary · A useful discussion')
    expect(action.prompt).toContain('hackernews_read_story')
    expect(action.prompt).toContain('story_id 42')
  })

  it('keeps selected text bounded and explicit', () => {
    const action = prepareHackerNewsAction('explain', {
      ...story,
      selection: `  ${'x'.repeat(9_000)}  `,
    })

    expect(action.title).toBe('Explain selection')
    expect(action.prompt).toContain(`Selected passage:\n${'x'.repeat(8_000)}`)
    expect(action.prompt).not.toContain('x'.repeat(8_001))
  })
})
