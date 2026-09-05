import css from './browser.module.css'
export type BrowserIconName = 'globe' | 'plus' | 'close' | 'back' | 'forward' | 'reload' | 'stop' | 'agent' | 'webmcp' | 'download' | 'export' | 'search' | 'chevron' | 'activity' | 'shield' | 'panel' | 'arrowUpRight' | 'more' | 'volume' | 'muted'
const paths: Record<Exclude<BrowserIconName, 'webmcp'>, string> = {
  volume: 'M11 4 6 8H3v8h3l5 4V4Zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
  muted: 'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  globe: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM4 12h16M12 4c4 4 4 12 0 16-4-4-4-12 0-16Z',
  plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6',
  back: 'm14 5-7 7 7 7M7 12h13', forward: 'm10 5 7 7-7 7M17 12H4',
  reload: 'M20 10a8 8 0 1 0-1 7M20 4v6h-6', stop: 'M6 6h12v12H6Z',
  agent: 'M4 5h16v12H9l-5 4V5ZM8 9h8M8 13h5',
  download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  export: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M13 11l8-8m-6 0h6v6M8 14h4M8 17h7',
  search: 'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  chevron: 'm6 9 6 6 6-6',
  activity: 'M4 6h2m4 0h10M4 12h2m4 0h10M4 18h2m4 0h10',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
  panel: 'M4 4h16v16H4ZM14 4v16', arrowUpRight: 'M6 18 18 6M7 6h11v11',
}
export function BrowserIcon({ name }: { name: BrowserIconName }) {
  // Preserve the approved geometry from design/webmcp-identity/webmcp.svg.
  if (name === 'webmcp') return <svg className={css.icon} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth={14} strokeLinecap="round" aria-hidden="true" focusable="false">
    <g transform="translate(64 64) scale(0.88) translate(-64 -64)">
      <path transform="rotate(0 64 64)" d="M42 36A22 22 0 0 1 86 36" />
      <path transform="rotate(120 64 64)" d="M42 36A22 22 0 0 1 86 36" />
      <path transform="rotate(240 64 64)" d="M42 36A22 22 0 0 1 86 36" />
    </g>
  </svg>
  return <svg className={css.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
