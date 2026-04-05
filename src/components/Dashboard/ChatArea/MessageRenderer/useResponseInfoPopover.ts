import { useState, useRef, useEffect } from 'react'

const RESPONSE_INFO_WIDTH = 260
const RESPONSE_INFO_PADDING = 12
const RESPONSE_INFO_HIDE_DELAY_MS = 120
const RESPONSE_INFO_OFFSET_X = 14
const RESPONSE_INFO_ESTIMATED_HEIGHT = 400

/**
 * Manages the hover-triggered ResponseInfo popover:
 * positioning, show/hide delays, and scroll/resize tracking.
 */
export function useResponseInfoPopover() {
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [isHoveringInfo, setIsHoveringInfo] = useState(false)
  const infoTriggerRef = useRef<HTMLDivElement>(null)
  const infoPopoverRef = useRef<HTMLDivElement>(null)
  const hidePopoverTimeoutRef = useRef<number | null>(null)

  const updatePopoverPosition = () => {
    const rect = infoTriggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const popoverRect = infoPopoverRef.current?.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const padding = RESPONSE_INFO_PADDING
    const popoverWidth = popoverRect?.width || RESPONSE_INFO_WIDTH
    const popoverHeight = popoverRect?.height || RESPONSE_INFO_ESTIMATED_HEIGHT

    const spaceOnRight = viewportWidth - rect.right - padding
    const spaceOnLeft = rect.left - padding
    const prefersRight = spaceOnRight >= popoverWidth || spaceOnRight >= spaceOnLeft

    let left = prefersRight
      ? rect.right + RESPONSE_INFO_OFFSET_X
      : rect.left - popoverWidth - RESPONSE_INFO_OFFSET_X

    const maxLeft = viewportWidth - popoverWidth - padding
    if (left > maxLeft) {
      left = rect.left - popoverWidth - RESPONSE_INFO_OFFSET_X
    }
    if (left < padding) {
      left = rect.right + RESPONSE_INFO_OFFSET_X
    }

    left = Math.min(Math.max(left, padding), Math.max(padding, maxLeft))

    let top = rect.top + rect.height / 2 - popoverHeight / 2
    const maxTop = viewportHeight - popoverHeight - padding
    top = Math.min(Math.max(top, padding), Math.max(padding, maxTop))

    setPopoverPosition({ top, left })
  }

  const clearHidePopoverTimeout = () => {
    if (hidePopoverTimeoutRef.current !== null) {
      window.clearTimeout(hidePopoverTimeoutRef.current)
      hidePopoverTimeoutRef.current = null
    }
  }

  const scheduleHidePopover = () => {
    clearHidePopoverTimeout()
    hidePopoverTimeoutRef.current = window.setTimeout(() => {
      setIsHoveringInfo(false)
      setPopoverPosition(null)
      hidePopoverTimeoutRef.current = null
    }, RESPONSE_INFO_HIDE_DELAY_MS)
  }

  const handleTriggerMouseEnter = () => {
    clearHidePopoverTimeout()
    setIsHoveringInfo(true)
    updatePopoverPosition()
  }

  const handleTriggerMouseLeave = () => {
    scheduleHidePopover()
  }

  const handlePopoverMouseEnter = () => {
    clearHidePopoverTimeout()
    setIsHoveringInfo(true)
    updatePopoverPosition()
  }

  const handlePopoverMouseLeave = () => {
    scheduleHidePopover()
  }

  // Update position on scroll/resize when hovering
  useEffect(() => {
    if (isHoveringInfo) {
      const animationFrame = window.requestAnimationFrame(() => {
        updatePopoverPosition()
      })
      const handleUpdate = () => updatePopoverPosition()
      window.addEventListener('scroll', handleUpdate, true)
      window.addEventListener('resize', handleUpdate)
      return () => {
        window.cancelAnimationFrame(animationFrame)
        window.removeEventListener('scroll', handleUpdate, true)
        window.removeEventListener('resize', handleUpdate)
      }
    }
  }, [isHoveringInfo])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearHidePopoverTimeout()
    }
  }, [])

  return {
    infoTriggerRef,
    infoPopoverRef,
    popoverPosition,
    handleTriggerMouseEnter,
    handleTriggerMouseLeave,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
  }
}
