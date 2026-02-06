import React from 'react'
import { Minus, Maximize2, Minimize2, X } from './icons'

export interface WindowControlButtonsProps {
  isMaximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}

/**
 * Presentational component that renders custom window control buttons
 * (minimize, maximize/restore, close) for use in the TitleBar when
 * frosted sidebar mode is active on Windows.
 *
 * Uses the existing `.app-titlebar__icon-btn` styling and `no-drag`
 * class to integrate seamlessly with the TitleBar layout.
 */
export default function WindowControlButtons({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: WindowControlButtonsProps) {
  return (
    <div className="app-titlebar__window-controls no-drag">
      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__window-btn no-drag"
        onClick={onMinimize}
        aria-label="Minimize window"
        title="Minimize"
      >
        <Minus size={14} />
      </button>

      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__window-btn no-drag"
        onClick={onToggleMaximize}
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>

      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__window-btn app-titlebar__icon-btn--close no-drag"
        onClick={onClose}
        aria-label="Close window"
        title="Close"
      >
        <X size={14} />
      </button>
    </div>
  )
}
