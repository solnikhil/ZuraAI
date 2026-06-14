import React from 'react'

export interface OverlayShellProps {
  /** Whether the conversation card is shown (controls the `is-expanded` class). */
  isExpanded: boolean
  children: React.ReactNode
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>
}

/**
 * Vibrant-glass container for the overlay. The window-level material (vibrancy /
 * acrylic) is applied in the main process; this shell layers the translucent
 * wash, border, shadow, and rounded corners on top and toggles the expanded
 * state class used by the stylesheet.
 */
export function OverlayShell({ isExpanded, children, onMouseMove }: OverlayShellProps): React.ReactElement {
  return (
    <div className={`zo-shell${isExpanded ? ' is-expanded' : ''}`} onMouseMove={onMouseMove}>
      <div aria-hidden="true" className="zo-drag-strip" />
      {children}
    </div>
  )
}

export default OverlayShell
