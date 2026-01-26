/**
 * Centralized dropdown position calculation hook for Zura AI
 * Consolidates duplicate dropdown positioning logic from Settings.tsx and ModelSelector.tsx
 * 
 * @module useDropdownPosition
 * Requirements: 4.3
 */

import { useState, useEffect, useCallback, RefObject } from 'react'

/**
 * Dropdown position result
 */
export interface DropdownPosition {
  top: number
  left: number
  width: number
  showAbove: boolean
}

/**
 * Options for the useDropdownPosition hook
 */
export interface UseDropdownPositionOptions {
  /** Reference to the trigger element */
  triggerRef: RefObject<HTMLElement | null>
  /** Whether the dropdown is currently open */
  isOpen: boolean
  /** Preferred width of the dropdown (default: 400) */
  preferredWidth?: number
  /** Preferred height of the dropdown for space calculation (default: 400) */
  preferredHeight?: number
  /** Offset from the trigger element (default: 12) */
  offset?: number
  /** Padding from viewport edges (default: 16) */
  viewportPadding?: number
  /** Whether to recalculate on window resize (default: true) */
  recalculateOnResize?: boolean
  /** Whether to recalculate on scroll (default: true) */
  recalculateOnScroll?: boolean
}

/**
 * Default position values
 */
const DEFAULT_POSITION: DropdownPosition = {
  top: 0,
  left: 0,
  width: 400,
  showAbove: false
}

/**
 * Calculate optimal dropdown position relative to trigger element
 * Handles viewport boundaries and scroll position
 * 
 * @param options - Configuration options
 * @returns DropdownPosition with calculated values and recalculate function
 */
export function useDropdownPosition(options: UseDropdownPositionOptions): {
  position: DropdownPosition
  recalculate: () => void
} {
  const {
    triggerRef,
    isOpen,
    preferredWidth = 400,
    preferredHeight = 400,
    offset = 12,
    viewportPadding = 16,
    recalculateOnResize = true,
    recalculateOnScroll = true
  } = options

  const [position, setPosition] = useState<DropdownPosition>({
    ...DEFAULT_POSITION,
    width: preferredWidth
  })

  /**
   * Calculate the optimal position for the dropdown
   */
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    
    // Calculate available space above and below
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    
    // Determine if dropdown should appear above or below
    const showAbove = spaceAbove >= preferredHeight + viewportPadding || spaceAbove > spaceBelow
    
    // Calculate top position
    let top: number
    if (showAbove) {
      top = rect.top - offset
    } else {
      top = rect.bottom + offset
    }
    
    // Calculate left position, keeping dropdown within viewport
    let left = rect.left
    if (left + preferredWidth > viewportWidth - viewportPadding) {
      left = viewportWidth - preferredWidth - viewportPadding
    }
    if (left < viewportPadding) {
      left = viewportPadding
    }
    
    // For electron apps, use document.body dimensions for better responsiveness
    const docWidth = document.body.clientWidth
    
    // Adjust for application bounds if in electron (when doc is smaller than viewport)
    if (docWidth < viewportWidth) {
      left = Math.min(left, docWidth - preferredWidth - viewportPadding)
    }
    
    setPosition({
      top,
      left,
      width: preferredWidth,
      showAbove
    })
  }, [triggerRef, preferredWidth, preferredHeight, offset, viewportPadding])

  // Recalculate position when dropdown opens
  useEffect(() => {
    if (isOpen) {
      calculatePosition()
    }
  }, [isOpen, calculatePosition])

  // Update position on window resize and scroll
  useEffect(() => {
    if (!isOpen) return

    const handlers: (() => void)[] = []

    if (recalculateOnResize) {
      const handleResize = () => calculatePosition()
      window.addEventListener('resize', handleResize)
      handlers.push(() => window.removeEventListener('resize', handleResize))
    }

    if (recalculateOnScroll) {
      const handleScroll = () => calculatePosition()
      window.addEventListener('scroll', handleScroll, true)
      handlers.push(() => window.removeEventListener('scroll', handleScroll, true))
    }

    return () => {
      handlers.forEach(cleanup => cleanup())
    }
  }, [isOpen, calculatePosition, recalculateOnResize, recalculateOnScroll])

  return {
    position,
    recalculate: calculatePosition
  }
}

/**
 * Calculate max height for dropdown based on available space
 * 
 * @param position - Current dropdown position
 * @param viewportPadding - Padding from viewport edges
 * @param maxHeight - Maximum allowed height
 * @returns Calculated max height in pixels
 */
export function calculateMaxHeight(
  position: DropdownPosition,
  viewportPadding: number = 16,
  maxHeight: number = 400
): number {
  const viewportHeight = window.innerHeight
  
  if (position.showAbove) {
    // Space available above the trigger
    return Math.max(200, Math.min(position.top - viewportPadding, maxHeight))
  } else {
    // Space available below the trigger
    return Math.max(200, Math.min(viewportHeight - position.top - viewportPadding, maxHeight))
  }
}

/**
 * Get CSS transform value for dropdown animation
 * 
 * @param showAbove - Whether dropdown appears above trigger
 * @returns CSS transform string
 */
export function getDropdownTransform(showAbove: boolean): string {
  return showAbove ? 'translateY(-100%)' : 'translateY(0)'
}

/**
 * Get animation keyframe name based on dropdown direction
 * 
 * @param showAbove - Whether dropdown appears above trigger
 * @returns Animation keyframe name
 */
export function getDropdownAnimation(showAbove: boolean): string {
  return showAbove ? 'dropdown-slide-up' : 'dropdown-slide-down'
}

export default useDropdownPosition
