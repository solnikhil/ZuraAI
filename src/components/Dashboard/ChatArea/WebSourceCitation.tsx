import React from 'react'

import { HoverLinkAnimation } from '@/components/ui/hover-link-animation'

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

export default function WebSourceCitation({ href, children, source }: WebSourceCitationProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title}
      className="no-underline"
    >
      <HoverLinkAnimation
        highlightColor='#93c5fd'
        className="rounded bg-[rgba(59,130,246,0.1)] px-1.5 py-0.5 text-[#60a5fa] transition-colors hover:bg-[rgba(59,130,246,0.15)]"
      >
        {children}
      </HoverLinkAnimation>
    </a>
  )
}
