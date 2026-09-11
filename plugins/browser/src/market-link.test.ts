import { expect, it } from 'vitest'
import { marketInstallLink, readMarketInstallLink, isDesktopParent } from './market-link.js'
import { githubAuthor, parseCatalog } from './webmcp-package.js'

it('roundtrips the exact repository, nested manifest and immutable version through a DeepDeck link', () => {
  const ref = { repository: 'https://github.com/test/webmcp', manifestPath: 'packages/demo/webmcp.json', repositoryId: 123, commit: 'a'.repeat(40) }
  expect(readMarketInstallLink(marketInstallLink(ref))).toEqual(ref)
})
it.each(['https://example.com/install?repository=x', 'deepdeck://webmcp/install?repository=https://evil.test/a/b', 'deepdeck://webmcp/install?repository=https://github.com/a/b&manifestPath=../secret', 'deepdeck://webmcp/install?repository=https://github.com/a/b&commit=main'])('rejects unsafe package requests %s', value => {
  expect(() => readMarketInstallLink(value)).toThrow()
})
it('recognizes only loopback desktop parents and derives maintainer links rather than trusting arbitrary avatar URLs', () => {
  expect(isDesktopParent('http://127.0.0.1:1234')).toBe(true)
  expect(isDesktopParent('https://localhost.evil.test')).toBe(false)
  expect(githubAuthor({ login: 'test', avatarUrl: 'https://evil.test/tracker', url: 'javascript:alert(1)' })).toEqual({ login: 'test', url: 'https://github.com/test', avatarUrl: 'https://github.com/test.png?size=80' })
  expect(() => githubAuthor({ login: '../evil' })).toThrow()
  const catalog = parseCatalog({ formatVersion: 1, generatedAt: null, entries: [{ id: 'test', repositoryId: 1, repository: 'https://github.com/test/repo', manifestPath: 'webmcp.json', origin: 'https://example.com', name: 'Example', description: 'Test', tags: [], status: 'active', author: { login: 'test' } }] })
  expect(catalog.entries[0]?.author?.url).toBe('https://github.com/test')
})
