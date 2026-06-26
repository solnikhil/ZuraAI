import React from 'react'

import { WithTooltip } from '../../ui/WithTooltip'

export interface WebSource {
  title: string
  url: string
  snippet?: string
  favicon?: string
  previewImage?: string
}

interface WebSourceCitationProps {
  href: string
  children: React.ReactNode
  source: WebSource
}

function getCitationLabel(children: React.ReactNode): React.ReactNode {
  const text = React.Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('')
    .trim()
  const citationMatch = text.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/)

  return citationMatch ? citationMatch[1].replace(/\s*,\s*/g, ',') : children
}

export default function WebSourceCitation({ href, children, source }: WebSourceCitationProps) {
  const label = getCitationLabel(children)

  return (
    <WithTooltip tooltip={source.title}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={typeof label === 'string' ? `Source ${label}: ${source.title}` : source.title}
        className="web-source-citation"
      >
        {label}
      </a>
    </WithTooltip>
  )
}
