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
        highlightColor='#0b1220'
        className="-mr-1 pr-1 text-[#60a5fa]"
      >
        {children}
      </HoverLinkAnimation>
    </a>
  )
}
