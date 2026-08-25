import type { SVGProps } from 'react'

/** Monochrome pointer mark sized to the composer's 16px outline icon set. */
export function ComputerUseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M3.35 2.35 8.2 13.62l1.45-3.77 3.83-1.46L3.35 2.35Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.45 9.67 3.22 3.22"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}
