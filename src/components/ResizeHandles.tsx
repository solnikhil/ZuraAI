import React, { useCallback, useRef } from 'react'
import './ResizeHandles.css'

export interface ResizeHandlesProps {
  disabled?: boolean // true when maximized
}

export type ResizeDirection =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** Minimum window dimensions (must match mainWindow.ts) */
const MIN_WIDTH = 900
const MIN_HEIGHT = 600

/** Cursor CSS values for each resize direction */
const CURSOR_MAP: Record<ResizeDirection, string> = {
  top: 'n-resize',
  bottom: 's-resize',
  left: 'w-resize',
  right: 'e-resize',
  'top-left': 'nw-resize',
  'top-right': 'ne-resize',
  'bottom-left': 'sw-resize',
  'bottom-right': 'se-resize',
}

/**
 * Given a resize direction and a mouse delta (from the drag start),
 * compute the new window bounds relative to the starting bounds.
 */
export function computeNewBounds(
  direction: ResizeDirection,
  startBounds: { x: number; y: number; width: number; height: number },
  deltaX: number,
  deltaY: number
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = startBounds

  // Apply horizontal component
  if (direction === 'left' || direction === 'top-left' || direction === 'bottom-left') {
    // Left edge: moving left increases width, moving right decreases width
    const newWidth = width - deltaX
    if (newWidth >= MIN_WIDTH) {
      x = x + deltaX
      width = newWidth
    } else {
      // Clamp: set width to minimum and adjust x accordingly
      x = x + (width - MIN_WIDTH)
      width = MIN_WIDTH
    }
  } else if (direction === 'right' || direction === 'top-right' || direction === 'bottom-right') {
    // Right edge: moving right increases width
    width = Math.max(MIN_WIDTH, width + deltaX)
  }

  // Apply vertical component
  if (direction === 'top' || direction === 'top-left' || direction === 'top-right') {
    // Top edge: moving up increases height, moving down decreases height
    const newHeight = height - deltaY
    if (newHeight >= MIN_HEIGHT) {
      y = y + deltaY
      height = newHeight
    } else {
      // Clamp: set height to minimum and adjust y accordingly
      y = y + (height - MIN_HEIGHT)
      height = MIN_HEIGHT
    }
  } else if (direction === 'bottom' || direction === 'bottom-left' || direction === 'bottom-right') {
    // Bottom edge: moving down increases height
    height = Math.max(MIN_HEIGHT, height + deltaY)
  }

  return { x, y, width, height }
}

/** Handle definition for rendering */
interface HandleDef {
  direction: ResizeDirection
  className: string
}

const HANDLES: HandleDef[] = [
  // Edges
  { direction: 'top', className: 'resize-handle resize-handle--top' },
  { direction: 'bottom', className: 'resize-handle resize-handle--bottom' },
  { direction: 'left', className: 'resize-handle resize-handle--left' },
  { direction: 'right', className: 'resize-handle resize-handle--right' },
  // Corners
  { direction: 'top-left', className: 'resize-handle resize-handle--corner resize-handle--top-left' },
  { direction: 'top-right', className: 'resize-handle resize-handle--corner resize-handle--top-right' },
  { direction: 'bottom-left', className: 'resize-handle resize-handle--corner resize-handle--bottom-left' },
  { direction: 'bottom-right', className: 'resize-handle resize-handle--corner resize-handle--bottom-right' },
]

/**
 * Renders 8 invisible resize regions (4 edges + 4 corners) around the
 * window perimeter. Each region tracks pointer events to compute new
 * window bounds and sends them to the main process via IPC.
 *
 * Used when frosted sidebar mode is active on Windows, since transparent
 * Electron windows lose their native resize handles.
 */
export default function ResizeHandles({ disabled }: ResizeHandlesProps) {
  // Refs to track drag state without causing re-renders
  const dragStateRef = useRef<{
    direction: ResizeDirection
    startScreenX: number
    startScreenY: number
    startBounds: { x: number; y: number; width: number; height: number }
    pointerId: number
    element: HTMLDivElement
  } | null>(null)

  const handlePointerDown = useCallback(
    (direction: ResizeDirection, e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()

      const element = e.currentTarget
      element.setPointerCapture(e.pointerId)

      // Capture current window bounds using standard browser APIs
      const startBounds = {
        x: window.screenX,
        y: window.screenY,
        width: window.outerWidth,
        height: window.outerHeight,
      }

      dragStateRef.current = {
        direction,
        startScreenX: e.screenX,
        startScreenY: e.screenY,
        startBounds,
        pointerId: e.pointerId,
        element,
      }
    },
    []
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state) return

    const deltaX = e.screenX - state.startScreenX
    const deltaY = e.screenY - state.startScreenY

    const newBounds = computeNewBounds(state.direction, state.startBounds, deltaX, deltaY)

    // Send new bounds to main process
    window.ipcRenderer?.invoke('window-resize', newBounds)
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state) return

    try {
      state.element.releasePointerCapture(state.pointerId)
    } catch {
      // Pointer capture may already be released
    }

    dragStateRef.current = null
  }, [])

  // When disabled (maximized), don't render any handles
  if (disabled) {
    return null
  }

  return (
    <div className="resize-handles" aria-hidden="true">
      {HANDLES.map(({ direction, className }) => (
        <div
          key={direction}
          className={className}
          style={{
            cursor: CURSOR_MAP[direction],
            WebkitAppRegion: 'no-drag' as unknown as string,
          }}
          data-direction={direction}
          onPointerDown={(e) => handlePointerDown(direction, e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </div>
  )
}
