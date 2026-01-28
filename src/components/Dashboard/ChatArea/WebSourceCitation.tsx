import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'

export interface WebSource {
  title: string
  url: string
  snippet?: string
  favicon?: string
}

interface WebSourceCitationProps {
  href: string
  children: React.ReactNode
  source: WebSource
}

function TooltipCard({ source, anchorRect }: { source: WebSource; anchorRect: DOMRect }) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number; showAbove: boolean }>({
    top: 0, left: 0, arrowLeft: 0, showAbove: true
  })

  useEffect(() => {
    if (!tooltipRef.current) return
    const tooltip = tooltipRef.current
    const tooltipRect = tooltip.getBoundingClientRect()
    const padding = 12
    const arrowSize = 8
    const gap = 6

    const spaceAbove = anchorRect.top
    const spaceBelow = window.innerHeight - anchorRect.bottom
    const showAbove = spaceAbove >= tooltipRect.height + gap + arrowSize || spaceBelow < tooltipRect.height + gap + arrowSize

    let top: number
    if (showAbove) {
      top = anchorRect.top - tooltipRect.height - gap - arrowSize
    } else {
      top = anchorRect.bottom + gap + arrowSize
    }

    const anchorCenter = anchorRect.left + anchorRect.width / 2
    let left = anchorCenter - tooltipRect.width / 2
    if (left < padding) left = padding
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding
    }

    const arrowLeft = Math.max(12, Math.min(anchorCenter - left, tooltipRect.width - 12))

    setPos({ top, left, arrowLeft, showAbove })
  }, [anchorRect])

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 10001,
        width: '320px',
        maxWidth: 'calc(100vw - 24px)',
        backgroundColor: 'var(--theme-surface, #1e1e2e)',
        border: '1px solid var(--theme-border, rgba(255,255,255,0.12))',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        padding: '12px',
        pointerEvents: 'none',
        animation: 'webSourceTooltipIn 0.15s ease-out'
      }}
    >
      {/* Favicon + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        {source.favicon ? (
          <img
            src={source.favicon}
            alt=""
            style={{ width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{
            width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
            background: 'rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', color: '#60a5fa', fontWeight: 700
          }}>
            {source.title?.[0]?.toUpperCase() || 'W'}
          </div>
        )}
        <span style={{
          color: 'var(--theme-text-primary, #e0e0e0)',
          fontSize: '0.85rem',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1
        }}>
          {source.title || 'Web Source'}
        </span>
      </div>

      {/* URL */}
      <div style={{
        color: '#60a5fa',
        fontSize: '0.75rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginBottom: source.snippet ? '8px' : '0'
      }}>
        {source.url}
      </div>

      {/* Snippet */}
      {source.snippet && (
        <div style={{
          color: 'var(--theme-text-secondary, #b0b0b0)',
          fontSize: '0.78rem',
          lineHeight: '1.4',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {source.snippet}
        </div>
      )}

      {/* Arrow */}
      <div style={{
        position: 'absolute',
        [pos.showAbove ? 'bottom' : 'top']: '-7px',
        left: `${pos.arrowLeft}px`,
        transform: 'translateX(-50%)',
        width: '14px',
        height: '7px',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          [pos.showAbove ? 'top' : 'bottom']: '0',
          left: '50%',
          transform: `translateX(-50%) rotate(${pos.showAbove ? '0' : '180'}deg)`,
          width: '0',
          height: '0',
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '7px solid var(--theme-border, rgba(255,255,255,0.12))'
        }} />
        <div style={{
          position: 'absolute',
          [pos.showAbove ? 'top' : 'bottom']: '1px',
          left: '50%',
          transform: `translateX(-50%) rotate(${pos.showAbove ? '0' : '180'}deg)`,
          width: '0',
          height: '0',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid var(--theme-surface, #1e1e2e)'
        }} />
      </div>
    </div>
  )
}

export default function WebSourceCitation({ href, children, source }: WebSourceCitationProps) {
  const [hovered, setHovered] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTooltip = useCallback(() => {
    if (linkRef.current) {
      setAnchorRect(linkRef.current.getBoundingClientRect())
      setHovered(true)
    }
  }, [])

  const hideTooltip = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setHovered(false)
    setAnchorRect(null)
  }, [])

  const handleMouseEnter = useCallback(() => {
    hoverTimeout.current = setTimeout(showTooltip, 200)
  }, [showTooltip])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    hideTooltip()
  }, [hideTooltip])

  // Update position on scroll while hovered
  useEffect(() => {
    if (!hovered) return
    const update = () => {
      if (linkRef.current) {
        setAnchorRect(linkRef.current.getBoundingClientRect())
      }
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [hovered])

  return (
    <>
      <a
        ref={linkRef}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          color: '#60a5fa',
          textDecoration: 'none',
          borderBottom: '1px dotted #60a5fa',
          backgroundColor: hovered ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '0.9em',
          fontWeight: 500,
          transition: 'all 0.15s ease',
          cursor: 'pointer'
        }}
      >
        {children}
      </a>
      {hovered && anchorRect && ReactDOM.createPortal(
        <TooltipCard source={source} anchorRect={anchorRect} />,
        document.body
      )}
      <style>{`
        @keyframes webSourceTooltipIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
