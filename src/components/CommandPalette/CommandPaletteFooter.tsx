import React from 'react'
import type { CommandPaletteSize } from './CommandPalette'

interface FooterSizeConfig {
  padding: string
  gap: number
  badgePadding: string
  badgeFontSize: string
  labelFontSize: string
  groupGap: number
}

const footerSizeMap: Record<CommandPaletteSize, FooterSizeConfig> = {
  small: {
    padding: '4px 10px',
    gap: 8,
    badgePadding: '1px 5px',
    badgeFontSize: '0.62rem',
    labelFontSize: '0.65rem',
    groupGap: 3,
  },
  medium: {
    padding: '6px 12px',
    gap: 12,
    badgePadding: '2px 6px',
    badgeFontSize: '0.7rem',
    labelFontSize: '0.72rem',
    groupGap: 4,
  },
  large: {
    padding: '8px 16px',
    gap: 14,
    badgePadding: '3px 7px',
    badgeFontSize: '0.76rem',
    labelFontSize: '0.8rem',
    groupGap: 5,
  },
}

function getKeyBadgeStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = footerSizeMap[size] ?? footerSizeMap.medium
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: config.badgePadding,
    borderRadius: 4,
    fontSize: config.badgeFontSize,
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: 1,
    background: 'var(--theme-surface-active)',
    border: '1px solid var(--theme-border)',
    color: 'var(--theme-text-secondary)',
  }
}

function getLabelStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = footerSizeMap[size] ?? footerSizeMap.medium
  return {
    fontSize: config.labelFontSize,
    color: 'var(--theme-text-muted)',
  }
}

function getGroupStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = footerSizeMap[size] ?? footerSizeMap.medium
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: config.groupGap,
  }
}

function getFooterStyle(size: CommandPaletteSize): React.CSSProperties {
  const config = footerSizeMap[size] ?? footerSizeMap.medium
  return {
    display: 'flex',
    alignItems: 'center',
    gap: config.gap,
    padding: config.padding,
    borderTop: '1px solid var(--theme-border)',
    flexShrink: 0,
  }
}

export default function CommandPaletteFooter({ size = 'medium' }: { size?: CommandPaletteSize }) {
  return (
    <div style={getFooterStyle(size)} aria-hidden="true">
      <span style={getGroupStyle(size)}>
        <kbd style={getKeyBadgeStyle(size)}>↑↓</kbd>
        <span style={getLabelStyle(size)}>Navigate</span>
      </span>
      <span style={getGroupStyle(size)}>
        <kbd style={getKeyBadgeStyle(size)}>↵</kbd>
        <span style={getLabelStyle(size)}>Select</span>
      </span>
      <span style={getGroupStyle(size)}>
        <kbd style={getKeyBadgeStyle(size)}>Shift</kbd>
        <kbd style={getKeyBadgeStyle(size)}>↵</kbd>
        <span style={getLabelStyle(size)}>Send</span>
      </span>
      <span style={getGroupStyle(size)}>
        <kbd style={getKeyBadgeStyle(size)}>Esc</kbd>
        <span style={getLabelStyle(size)}>Close</span>
      </span>
    </div>
  )
}
