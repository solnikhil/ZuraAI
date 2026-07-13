import React from 'react'
import type { CommandBarSuggestion } from '../../commandBar/suggestions'
import { getSuggestionIcon } from '../../commandBar/icons'
import type { CommandPaletteSize } from './CommandPalette'

export interface CommandPaletteResultListProps {
  suggestions: CommandBarSuggestion[]
  recentSuggestions: CommandBarSuggestion[]
  highlightIndex: number
  query: string
  size?: CommandPaletteSize
  onSelect: (suggestion: CommandBarSuggestion) => void
  onHighlight: (index: number) => void
}

interface ResultSizeConfig {
  itemPadding: string
  itemGap: number
  iconSize: number
  iconWrapSize: number
  titleFontSize: string
  subtitleFontSize: string
  sectionHeaderFontSize: string
  sectionHeaderPadding: string
  emptyPadding: string
  emptyFontSize: string
}

const resultSizeMap: Record<CommandPaletteSize, ResultSizeConfig> = {
  small: {
    itemPadding: '5px 10px',
    itemGap: 8,
    iconSize: 14,
    iconWrapSize: 18,
    titleFontSize: '0.76rem',
    subtitleFontSize: '0.66rem',
    sectionHeaderFontSize: '0.62rem',
    sectionHeaderPadding: '6px 10px 3px',
    emptyPadding: '20px 10px',
    emptyFontSize: '0.75rem',
  },
  medium: {
    itemPadding: '7px 12px',
    itemGap: 10,
    iconSize: 16,
    iconWrapSize: 22,
    titleFontSize: '0.82rem',
    subtitleFontSize: '0.72rem',
    sectionHeaderFontSize: '0.68rem',
    sectionHeaderPadding: '8px 12px 4px',
    emptyPadding: '24px 12px',
    emptyFontSize: '0.8rem',
  },
  large: {
    itemPadding: '10px 16px',
    itemGap: 12,
    iconSize: 18,
    iconWrapSize: 26,
    titleFontSize: '0.95rem',
    subtitleFontSize: '0.82rem',
    sectionHeaderFontSize: '0.74rem',
    sectionHeaderPadding: '10px 16px 5px',
    emptyPadding: '28px 16px',
    emptyFontSize: '0.88rem',
  },
}

/* ── inline styles using CSS custom properties ── */

const listboxStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  padding: '4px 0',
}

function getSectionHeaderStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return {
    fontSize: config.sectionHeaderFontSize,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: 'var(--theme-text-muted)',
    padding: config.sectionHeaderPadding,
    userSelect: 'none',
  }
}

function getItemStyle(size: CommandPaletteSize, isHighlighted: boolean): React.CSSProperties {
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return {
    display: 'flex',
    alignItems: 'center',
    gap: config.itemGap,
    padding: config.itemPadding,
    cursor: 'pointer',
    borderRadius: 8,
    margin: '0 4px',
    transition: 'background 80ms ease',
    background: isHighlighted
      ? 'color-mix(in srgb, var(--theme-surface-hover) 88%, transparent)'
      : undefined,
  }
}

function getIconWrapStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: config.iconWrapSize,
    height: config.iconWrapSize,
    color: 'var(--theme-text-secondary)',
  }
}

function getTitleStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return {
    fontSize: config.titleFontSize,
    color: 'var(--theme-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

function getSubtitleStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return {
    fontSize: config.subtitleFontSize,
    color: 'var(--theme-text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginLeft: 'auto',
    flexShrink: 0,
  }
}

function getEmptyStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return {
    padding: config.emptyPadding,
    textAlign: 'center',
    fontSize: config.emptyFontSize,
    color: 'var(--theme-text-muted)',
  }
}

/* ── helpers ── */

function ResultItem({
  suggestion,
  index,
  isHighlighted,
  size,
  onSelect,
  onHighlight,
}: {
  suggestion: CommandBarSuggestion
  index: number
  isHighlighted: boolean
  size: CommandPaletteSize
  onSelect: (s: CommandBarSuggestion) => void
  onHighlight: (i: number) => void
}) {
  const { Icon, iconClass } = getSuggestionIcon(suggestion)
  const config = resultSizeMap[size] ?? resultSizeMap.medium
  return (
    <div
      id={`command-palette-item-${index}`}
      role="option"
      aria-selected={isHighlighted}
      style={getItemStyle(size, isHighlighted)}
      onClick={() => onSelect(suggestion)}
      onMouseEnter={() => onHighlight(index)}
    >
      <span style={getIconWrapStyle(size)} className={iconClass}>
        <Icon size={config.iconSize} />
      </span>
      <span style={getTitleStyle(size)}>{suggestion.title}</span>
      {suggestion.subtitle && <span style={getSubtitleStyle(size)}>{suggestion.subtitle}</span>}
    </div>
  )
}

/* ── main component ── */

export default function CommandPaletteResultList({
  suggestions,
  recentSuggestions,
  highlightIndex,
  query,
  size = 'medium',
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
        <div style={getEmptyStyle(size)}>No results found</div>
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
            size={size}
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
          <div style={getSectionHeaderStyle(size)}>Recent</div>
          {recentItems.map((s) => {
            const idx = flatIndex++
            return (
              <ResultItem
                key={`recent-${s.id}`}
                suggestion={s}
                index={idx}
                isHighlighted={idx === highlightIndex}
                size={size}
                onSelect={onSelect}
                onHighlight={onHighlight}
              />
            )
          })}
        </>
      )}
      <div style={getSectionHeaderStyle(size)}>Commands</div>
      {suggestions.map((s) => {
        const idx = flatIndex++
        return (
          <ResultItem
            key={s.id}
            suggestion={s}
            index={idx}
            isHighlighted={idx === highlightIndex}
            size={size}
            onSelect={onSelect}
            onHighlight={onHighlight}
          />
        )
      })}
    </div>
  )
}
