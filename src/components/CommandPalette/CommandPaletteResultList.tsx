import React from 'react'
import type { CommandBarSuggestion } from '../../commandBar/suggestions'
import { getSuggestionIcon } from '../../commandBar/icons'

export interface CommandPaletteResultListProps {
  suggestions: CommandBarSuggestion[]
  recentSuggestions: CommandBarSuggestion[]
  highlightIndex: number
  query: string
  onSelect: (suggestion: CommandBarSuggestion) => void
  onHighlight: (index: number) => void
}

/* ── inline styles using CSS custom properties ── */

const listboxStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  padding: '4px 0',
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: 'var(--theme-text-muted)',
  padding: '8px 12px 4px',
  userSelect: 'none',
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 12px',
  cursor: 'pointer',
  borderRadius: 6,
  margin: '0 4px',
  transition: 'background 80ms ease',
}

const itemHighlightedStyle: React.CSSProperties = {
  ...itemStyle,
  background: 'var(--theme-surface-hover)',
}

const iconWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: 22,
  height: 22,
  color: 'var(--theme-text-secondary)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  color: 'var(--theme-text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--theme-text-muted)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginLeft: 'auto',
  flexShrink: 0,
}

const emptyStyle: React.CSSProperties = {
  padding: '24px 12px',
  textAlign: 'center',
  fontSize: '0.8rem',
  color: 'var(--theme-text-muted)',
}

/* ── helpers ── */

function ResultItem({
  suggestion,
  index,
  isHighlighted,
  onSelect,
  onHighlight,
}: {
  suggestion: CommandBarSuggestion
  index: number
  isHighlighted: boolean
  onSelect: (s: CommandBarSuggestion) => void
  onHighlight: (i: number) => void
}) {
  const { Icon, iconClass } = getSuggestionIcon(suggestion)
  return (
    <div
      id={`command-palette-item-${index}`}
      role="option"
      aria-selected={isHighlighted}
      style={isHighlighted ? itemHighlightedStyle : itemStyle}
      onClick={() => onSelect(suggestion)}
      onMouseEnter={() => onHighlight(index)}
    >
      <span style={iconWrapStyle} className={iconClass}>
        <Icon size={16} />
      </span>
      <span style={titleStyle}>{suggestion.title}</span>
      {suggestion.subtitle && <span style={subtitleStyle}>{suggestion.subtitle}</span>}
    </div>
  )
}

/* ── main component ── */

export default function CommandPaletteResultList({
  suggestions,
  recentSuggestions,
  highlightIndex,
  query,
  onSelect,
  onHighlight,
}: CommandPaletteResultListProps) {
  const hasQuery = query.trim().length > 0
  const recentItems = recentSuggestions.slice(0, 3)
  const showRecent = !hasQuery && recentItems.length > 0

  const items: CommandBarSuggestion[] = []
  if (!hasQuery) {
    if (showRecent) items.push(...recentItems)
    items.push(...suggestions)
  } else {
    items.push(...suggestions)
  }

  if (items.length === 0) {
    return (
      <div role="listbox" style={listboxStyle}>
        <div style={emptyStyle}>No results found</div>
      </div>
    )
  }

  // Non-empty query → flat list, no headers
  if (hasQuery) {
    return (
      <div role="listbox" style={listboxStyle}>
        {items.map((s, i) => (
          <ResultItem
            key={s.id}
            suggestion={s}
            index={i}
            isHighlighted={i === highlightIndex}
            onSelect={onSelect}
            onHighlight={onHighlight}
          />
        ))}
      </div>
    )
  }

  // Empty query → grouped: Recent (optional) + Commands
  let flatIndex = 0
  return (
    <div role="listbox" style={listboxStyle}>
      {showRecent && (
        <>
          <div style={sectionHeaderStyle}>Recent</div>
          {recentItems.map((s) => {
            const idx = flatIndex++
            return (
              <ResultItem
                key={`recent-${s.id}`}
                suggestion={s}
                index={idx}
                isHighlighted={idx === highlightIndex}
                onSelect={onSelect}
                onHighlight={onHighlight}
              />
            )
          })}
        </>
      )}
      <div style={sectionHeaderStyle}>Commands</div>
      {suggestions.map((s) => {
        const idx = flatIndex++
        return (
          <ResultItem
            key={s.id}
            suggestion={s}
            index={idx}
            isHighlighted={idx === highlightIndex}
            onSelect={onSelect}
            onHighlight={onHighlight}
          />
        )
      })}
    </div>
  )
}
