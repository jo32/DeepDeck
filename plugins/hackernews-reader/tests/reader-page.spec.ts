import { describe, expect, it } from 'vitest'
import { renderHackerNewsReaderPage } from '../src/reader-page.js'

describe('Hacker News reader page', () => {
  it('ships a syntactically valid, self-contained app script', () => {
    const page = renderHackerNewsReaderPage()
    const script = page.match(/<script>([\s\S]*?)<\/script>/u)?.[1]

    expect(script).toBeTruthy()
    expect(() => new Function(script ?? '')).not.toThrow()
    expect(page).toContain('id="feeds"')
    expect(page).toContain('id="storyList"')
    expect(page).toContain('id="readerPane"')
    expect(page).toContain('id="loginForm"')
    expect(page).toContain('autocomplete="current-password"')
    expect(page).toContain('prefers-reduced-motion')
  })

  it('exposes session login without persisting the password in page state', () => {
    const page = renderHackerNewsReaderPage()

    expect(page).toContain("call('auth-status', { validate:true })")
    expect(page).toContain("call('login', { username:username, password:password })")
    expect(page).toContain("call('logout')")
    expect(page).toContain("loginPassword.value = ''")
    expect(page).not.toContain('state.password')
  })

  it('renders remote content through text nodes rather than HTML injection', () => {
    const page = renderHackerNewsReaderPage()

    expect(page).toContain('textContent')
    expect(page).toContain('replaceChildren')
    expect(page).not.toContain('.innerHTML')
    expect(page).not.toContain('insertAdjacentHTML')
  })

  it('opens app conversations directly in their canonical Session', () => {
    const page = renderHackerNewsReaderPage()

    expect(page).toContain('deepdeck-app-conversations-v1')
    expect(page).toContain("source:'deepdeck-app-page'")
    expect(page).toContain('openSession:true')
    expect(page).not.toContain('id="aiPreview"')
    expect(page).not.toContain('Jump to session')
    expect(page).toContain('id="selectionExplain"')
    expect(page).toContain('id="selectionSummarize"')
    expect(page).toContain("event.key.toLowerCase() === 'j'")
    expect(page).toContain("event.key.toLowerCase() === 'k'")
  })

  it('bounds the grid row so both content panes remain independently scrollable', () => {
    const page = renderHackerNewsReaderPage()

    expect(page).toMatch(/\.layout\{[^}]*grid-template-rows:minmax\(0,1fr\)/u)
    expect(page).toMatch(/\.storiesPane\{[^}]*min-height:0/u)
    expect(page).toMatch(/\.storyList\{[^}]*overflow:auto/u)
    expect(page).toMatch(/\.readerPane\{[^}]*min-height:0[^}]*overflow:auto/u)
  })

  it('keeps the top-bar keyboard shortcut hint on one line', () => {
    const page = renderHackerNewsReaderPage()

    expect(page).toMatch(/\.shortcut\{[^}]*flex:none[^}]*white-space:nowrap/u)
  })
})
