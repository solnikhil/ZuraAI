import { useEffect, useMemo, useState } from 'react'
import type { ModelSelectorCompactMode } from './types'

export function useResponsiveModelSelector(
  dropdownWidth: 'compact' | 'default' | 'wide',
  minimal?: boolean
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
    compact: 560,
    wide: 920,
    default: 780,
  }[dropdownWidth]

  const effectiveDropdownWidth = useMemo(() => {
    const maxAllowedWidth = Math.max(320, viewportSize.width - 24)
    return Math.min(baseDropdownWidth, maxAllowedWidth)
  }, [baseDropdownWidth, viewportSize.width])

  const compactMode: ModelSelectorCompactMode = useMemo(() => {
    if (effectiveDropdownWidth <= 430) return 'tight'
    if (effectiveDropdownWidth <= 560) return 'compact'
    return 'none'
  }, [effectiveDropdownWidth])

  const effectiveDropdownHeight = useMemo(() => {
    return Math.max(180, Math.min(540, viewportSize.height - 32))
  }, [viewportSize.height])

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
