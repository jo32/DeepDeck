import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { BRAND } from './generated-brand.ts'

function brandStyles(): string {
  const mark = JSON.stringify(BRAND.markDataUrl)
  return `
html[data-deepdeck-brand="${BRAND.id}"] {
  --deepdeck-accent: ${BRAND.accentColor};
  --deepdeck-accent-soft: ${BRAND.accentColorSoft};
}

html[data-deepdeck-brand="${BRAND.id}"] svg[viewBox="0 0 23.16 17.04"] {
  background-color: var(--dsw-alias-label-primary, currentColor) !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  color: transparent !important;
}

html[data-deepdeck-brand="${BRAND.id}"] svg[viewBox="0 0 23.16 17.04"] {
  -webkit-mask: url(${mark}) center / contain no-repeat;
  mask: url(${mark}) center / contain no-repeat;
}

html[data-deepdeck-brand="${BRAND.id}"] svg[viewBox="0 0 23.16 17.04"] > * {
  display: none !important;
}
`
}

/** Attach document identity and visual assets to the desktop-shell lifecycle. */
export function installBranding(ctx: ClientContext): void {
  ctx.effect(() => {
    const root = document.documentElement
    const previousBrand = root.getAttribute('data-deepdeck-brand')
    const previousTitle = document.title
    root.dataset.deepdeckBrand = BRAND.id
    document.title = BRAND.name

    const style = document.createElement('style')
    style.dataset.deepdeckBrandStyles = BRAND.id
    style.textContent = brandStyles()
    document.head.append(style)

    const existingIcon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    const icon = existingIcon ?? document.createElement('link')
    const previousIcon = existingIcon === null
      ? undefined
      : { href: icon.getAttribute('href'), type: icon.getAttribute('type') }
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.href = BRAND.faviconDataUrl
    if (existingIcon === null) document.head.append(icon)

    return () => {
      style.remove()
      if (previousBrand === null) delete root.dataset.deepdeckBrand
      else root.setAttribute('data-deepdeck-brand', previousBrand)
      document.title = previousTitle
      if (previousIcon === undefined) icon.remove()
      else {
        if (previousIcon.href === null) icon.removeAttribute('href')
        else icon.setAttribute('href', previousIcon.href)
        if (previousIcon.type === null) icon.removeAttribute('type')
        else icon.setAttribute('type', previousIcon.type)
      }
    }
  }, 'deepdeck desktop: document metadata + visual identity')
}
