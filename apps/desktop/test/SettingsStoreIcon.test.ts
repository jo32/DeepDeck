import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shell = readFileSync(
  new URL('../../../plugins/desktop-chrome/src/client/settings-shell.tsx', import.meta.url),
  'utf8',
)
const chromeClient = readFileSync(
  new URL('../../../plugins/desktop-chrome/src/client/index.ts', import.meta.url),
  'utf8',
)
const chromePatch = readFileSync(
  new URL('../../../plugins/desktop-chrome/cordis.patch.yml', import.meta.url),
  'utf8',
)
const storeClient = readFileSync(
  new URL('../../../plugins/app-conversations/src/client/index.ts', import.meta.url),
  'utf8',
)

describe('Store settings navigation icon', () => {
  it('registers Store under its own semantic section id', () => {
    expect(storeClient).toMatch(/name: 'settings\.section',[\s\S]*?id: 'store'/)
  })

  it('renders a dedicated storefront glyph for Store', () => {
    expect(shell).toContain('data-icon="deepdeck-store"')
    expect(shell).toContain("if (id === 'store') return <StoreOutlineIcon")
  })

  it('replaces the stock hard-coded shell through Cordis composition', () => {
    expect(chromePatch).toMatch(/id: ui-settings-general[\s\S]*?disabled: true/)
    expect(chromeClient).toContain('installDesktopSettingsShell(ctx)')
  })
})

describe('provider-aware web composition', () => {
  it('disables the stock web service and inserts the DeepDeck replacement', () => {
    expect(chromePatch).toMatch(
      /id: web\s+name: '@deepseek-ai\/dsh-web'\s+disabled: true/,
    )
    expect(chromePatch).toMatch(
      /id: deepdeck-provider-aware-web\s+name: '@deepdeck\/dsh-provider-aware-web'/,
    )
  })
})
