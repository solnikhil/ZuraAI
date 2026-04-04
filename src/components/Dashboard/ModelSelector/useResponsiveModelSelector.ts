import { useEffect, useMemo, useState } from 'react'
import type { ModelSelectorCompactMode } from './types'

export function useResponsiveModelSelector(
  dropdownWidth: 'compact' | 'default' | 'wide',
  minimal?: boolean,
  modelCount?: number
): {
  compactMode: ModelSelectorCompactMode
  effectiveDropdownWidth: number
  effectiveDropdownHeight: number
  triggerLabelMaxWidth: string
} {
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', updateViewportSize)
    return () => window.removeEventListener('resize', updateViewportSize)
  }, [])

  const baseDropdownWidth = {
    compact: 420,
    wide: 640,
    default: 520,
  }[dropdownWidth]

  const effectiveDropdownWidth = useMemo(() => {
    const maxAllowedWidth = Math.max(320, viewportSize.width - 24)
    return Math.min(baseDropdownWidth, maxAllowedWidth)
  }, [baseDropdownWidth, viewportSize.width])

  const compactMode: ModelSelectorCompactMode = useMemo(() => {
    if (effectiveDropdownWidth <= 380) return 'tight'
    if (effectiveDropdownWidth <= 460) return 'compact'
    return 'none'
  }, [effectiveDropdownWidth])

  const effectiveDropdownHeight = useMemo(() => {
    const maxViewportHeight = Math.max(160, Math.min(484, viewportSize.height - 24))
    if (modelCount == null || modelCount === 0) {
      // Empty state gets a separate minimum
      return Math.min(280, maxViewportHeight)
    }
    // Adaptive: calculate based on actual model count
    const rowHeight = 52
    const searchBarHeight = 52
    const groupHeadingHeight = 32
    const padding = 16
    const contentHeight = searchBarHeight + groupHeadingHeight + padding + modelCount * rowHeight
    return Math.max(280, Math.min(contentHeight, maxViewportHeight))
  }, [viewportSize.height, modelCount])

  const triggerLabelMaxWidth = minimal
    ? compactMode === 'tight'
      ? '100px'
      : compactMode === 'compact'
        ? '140px'
        : '220px'
    : '140px'

  return {
    compactMode,
    effectiveDropdownWidth,
    effectiveDropdownHeight,
    triggerLabelMaxWidth,
  }
}
