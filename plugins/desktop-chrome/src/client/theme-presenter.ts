import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

type DesktopThemeSource = 'light' | 'dark' | 'system'

interface DesktopAppearanceBridge {
  setThemeSource(source: DesktopThemeSource): Promise<void>
}

function desktopAppearanceBridge(): DesktopAppearanceBridge | undefined {
  const desktopGlobal = globalThis as typeof globalThis & {
    deepseekDesktop?: { appearance?: DesktopAppearanceBridge }
  }
  return desktopGlobal.deepseekDesktop?.appearance
}

/** Projects the Harness theme service onto the document. */
export class ThemePresenter {
  private appliedTokens: string[] = []
  private readonly meta: HTMLMetaElement

  constructor() {
    this.meta = document.createElement('meta')
    this.meta.name = 'theme-color'
  }

  apply(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    if (scheme === 'dark') document.body.setAttribute(DARK_ATTRIBUTE, '')
    else document.body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) document.body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      document.body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.meta.content = getComputedStyle(document.body).backgroundColor
    if (!this.meta.isConnected) document.head.append(this.meta)

    const nativeSource = snapshot.preference === 'system' ? 'system' : scheme
    void desktopAppearanceBridge()?.setThemeSource(nativeSource).catch(() => {
      // The same plugin also runs in ordinary browsers where no desktop host exists.
    })
  }

  dispose(): void {
    document.documentElement.style.removeProperty('color-scheme')
    document.body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) document.body.style.removeProperty(name)
    this.appliedTokens = []
    this.meta.remove()
  }
}
