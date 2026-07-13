import type { SVGProps } from 'react'

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  size?: number
}

function glyphProps({ size = 14, ...props }: GlyphProps): SVGProps<SVGSVGElement> {
  return {
    ...props,
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': props['aria-label'] ? undefined : true,
  }
}

/** A commit stamp: the two rails suggest history while the check confirms the action. */
export function ZuraCommitGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M5.5 5.25v13.5M18.5 5.25v13.5" />
      <path d="m8.25 12.1 2.35 2.35 5.25-5.3" />
    </svg>
  )
}

/** A compact branch graph with an asymmetric bend—the recurring Zura cut. */
export function ZuraBranchGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <circle cx="6" cy="5.25" r="1.5" />
      <circle cx="18" cy="6.5" r="1.5" />
      <circle cx="6" cy="18.75" r="1.5" />
      <path d="M6 6.75v10.5M7.5 12h3.75c3.75 0 6.75-1.5 6.75-4" />
    </svg>
  )
}

/** Fetch is a single broken orbit, kept deliberately distinct from directional transfer. */
export function ZuraFetchGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M18.75 8.25A7.25 7.25 0 1 0 18.5 16.5" />
      <path d="M18.75 4.75v3.5h-3.5" />
    </svg>
  )
}

/** Pull moves remote work down into the local branch rail. */
export function ZuraPullGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M12 4.5V15m-3.25-3.25L12 15l3.25-3.25" />
      <path d="M5 17.5v1.75h14V17.5" />
    </svg>
  )
}

/** Push lifts local work from the branch rail toward the remote. */
export function ZuraPushGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M12 15V4.5M8.75 7.75 12 4.5l3.25 3.25" />
      <path d="M5 17.5v1.75h14V17.5" />
    </svg>
  )
}

/** A compact repository folder without details that disappear below 16px. */
export function ZuraRepositoryGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M3.5 6.25h5.25l2 2h9.75v9.25a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.25Z" />
    </svg>
  )
}
