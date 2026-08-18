import type { CSSProperties, ImgHTMLAttributes } from 'react'

/**
 * Vector snapshot of the Alien Orb's neutral front pose. It deliberately uses
 * gradients only: filters and per-instance animation are avoided so hundreds
 * of copies stay on the browser's inexpensive image-compositing path.
 */
export const ALIEN_ORB_ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<defs>',
  '<radialGradient id="body" cx="27%" cy="18%" r="88%">',
  '<stop offset="0" stop-color="#4a4d5b"/>',
  '<stop offset=".13" stop-color="#1a1c25"/>',
  '<stop offset=".58" stop-color="#08090f"/>',
  '<stop offset="1" stop-color="#010208"/>',
  '</radialGradient>',
  '<linearGradient id="rim" x1="12" y1="8" x2="55" y2="57" gradientUnits="userSpaceOnUse">',
  '<stop offset="0" stop-color="#ffffff" stop-opacity=".42"/>',
  '<stop offset=".42" stop-color="#7788ff" stop-opacity=".08"/>',
  '<stop offset=".78" stop-color="#6679ff" stop-opacity=".78"/>',
  '<stop offset="1" stop-color="#1b225f" stop-opacity=".35"/>',
  '</linearGradient>',
  '<linearGradient id="eye" x1="38" y1="21" x2="47" y2="43" gradientUnits="userSpaceOnUse">',
  '<stop offset="0" stop-color="#ffffff"/>',
  '<stop offset=".48" stop-color="#f4f5ff"/>',
  '<stop offset=".82" stop-color="#cbd4ff"/>',
  '<stop offset="1" stop-color="#f8f5ff"/>',
  '</linearGradient>',
  '</defs>',
  '<circle cx="32" cy="32" r="29" fill="url(#body)"/>',
  '<circle cx="32" cy="32" r="28.4" fill="none" stroke="url(#rim)" stroke-width="1.2"/>',
  '<ellipse cx="21" cy="14.5" rx="9" ry="4.2" transform="rotate(-24 21 14.5)" fill="#ffffff" opacity=".095"/>',
  '<path d="M35.2 34c.3-6.3 3.5-11.7 8.9-14 3 .4 5.2 3.4 6 8.2-.1 6-2.9 12.3-8.9 15.8-3.8-1.8-5.8-5.4-6-10Z" fill="url(#eye)" stroke="#03040a" stroke-width="1.7" stroke-linejoin="round"/>',
  '<path d="M35.2 34c.3-6.3 3.5-11.7 8.9-14 3 .4 5.2 3.4 6 8.2-.1 6-2.9 12.3-8.9 15.8-3.8-1.8-5.8-5.4-6-10Z" transform="translate(64 0) scale(-1 1)" fill="url(#eye)" stroke="#03040a" stroke-width="1.7" stroke-linejoin="round"/>',
  '<path d="M43.2 22.2c2.4-.5 4.2.7 5.1 2.7" fill="none" stroke="#ffffff" stroke-width="1.15" stroke-linecap="round" opacity=".72"/>',
  '<path d="M20.8 22.2c-2.4-.5-4.2.7-5.1 2.7" fill="none" stroke="#ffffff" stroke-width="1.15" stroke-linecap="round" opacity=".72"/>',
  '</svg>',
].join('')

/** Stable URL shared by every icon instance and the browser's decoded-image cache. */
export const ALIEN_ORB_ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(ALIEN_ORB_ICON_SVG)}`

export interface AlienOrbIconProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'alt' | 'draggable' | 'height' | 'src' | 'width'
> {
  /** Square icon edge in CSS pixels. */
  readonly size?: number
  /** Accessible name. Omit it when a surrounding control already has a label. */
  readonly label?: string
}

const BASE_STYLE: CSSProperties = {
  display: 'block',
  flex: 'none',
  pointerEvents: 'none',
  userSelect: 'none',
}

/**
 * One-node, cache-shared Alien Orb renderer for dense UI surfaces. Unlike the
 * hero renderer it creates no canvas, WebGL context, animation loop, or Three.js
 * scene, while retaining resolution-independent SVG output.
 */
export function AlienOrbIcon({
  size = 16,
  label,
  style,
  ...imageProps
}: AlienOrbIconProps): React.JSX.Element {
  return (
    <img
      {...imageProps}
      src={ALIEN_ORB_ICON_DATA_URI}
      width={size}
      height={size}
      style={{ ...BASE_STYLE, ...style }}
      alt={label ?? ''}
      aria-hidden={label === undefined ? true : undefined}
      data-character="alien"
      data-renderer="baked-svg"
      decoding="async"
      draggable={false}
    />
  )
}
