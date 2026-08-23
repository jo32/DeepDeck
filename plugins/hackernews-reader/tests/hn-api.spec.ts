import { describe, expect, it } from 'vitest'
import { HackerNewsClient, hackerNewsHtmlToText } from '../src/hn-api.js'

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('HackerNewsClient', () => {
  it('loads a paged feed and filters unavailable items', async () => {
    const requests: string[] = []
    const client = new HackerNewsClient(async (input) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith('/topstories.json')) return jsonResponse([30, 20])
      if (url.endsWith('/item/30.json')) {
        return jsonResponse({
          id: 30,
          type: 'story',
          by: 'builder',
          time: 100,
          score: 42,
          descendants: 8,
          title: 'A useful project',
          url: 'https://example.com/post',
        })
      }
      if (url.endsWith('/item/20.json')) return jsonResponse({ id: 20, deleted: true })
      throw new Error(`unexpected request: ${url}`)
    }, () => 1_000)

    const result = await client.listStories('top', 1, 30)

    expect(result.total).toBe(2)
    expect(result.stories).toEqual([expect.objectContaining({
      id: 30,
      title: 'A useful project',
      domain: 'example.com',
    })])
    expect(requests).toHaveLength(3)
  })

  it('uses the newest-first Algolia endpoint when requested', async () => {
    let requested = ''
    const client = new HackerNewsClient(async (input) => {
      requested = String(input)
      return jsonResponse({
        page: 1,
        nbPages: 4,
        nbHits: 70,
        hits: [{ objectID: '9', title: 'Typed search', author: 'reader', created_at_i: 90 }],
      })
    })

    const result = await client.searchStories('type systems', 2, 'date', 20)

    expect(requested).toContain('/search_by_date?')
    expect(requested).toContain('query=type+systems')
    expect(requested).toContain('tags=story')
    expect(requested).toContain('page=1')
    expect(result).toMatchObject({ page: 2, pages: 4, total: 70, sort: 'date' })
  })

  it('flattens discussion trees in display order and reports truncation', async () => {
    const client = new HackerNewsClient(async () => jsonResponse({
      id: 100,
      title: 'Deep thread',
      author: 'op',
      points: 15,
      num_comments: 2,
      created_at_i: 1_000,
      children: [{
        id: 101,
        parent_id: 100,
        author: 'first',
        created_at_i: 1_001,
        text: 'First <b>comment</b>',
        children: [{
          id: 102,
          parent_id: 101,
          author: 'second',
          created_at_i: 1_002,
          text: 'Nested',
          children: [],
        }],
      }],
    }))

    const result = await client.readStory(100, 1)

    expect(result.comments).toEqual([expect.objectContaining({
      id: 101,
      depth: 0,
      text: 'First comment',
    })])
    expect(result.commentsTruncated).toBe(true)
  })
})

describe('hackerNewsHtmlToText', () => {
  it('decodes common entities and removes active markup', () => {
    expect(hackerNewsHtmlToText('<p>Hello &amp; goodbye</p><script>alert(1)</script>'))
      .toBe('Hello & goodbye\n\nalert(1)')
  })
})
