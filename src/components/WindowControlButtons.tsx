import type { ReactElement } from 'react'

export interface WindowControlButtonsProps {
  isMaximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}

function MinimizeWindowIcon({ size = 10 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 5.5H8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  )
}

function MaximizeWindowIcon({ size = 10 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="1.6" y="1.6" width="6.8" height="6.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function RestoreWindowIcon({ size = 10 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3.6 1.6H8.4V6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
      <rect x="1.6" y="3.6" width="4.8" height="4.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function CloseWindowIcon({ size = 10 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.8 1.8L8.2 8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
      <path d="M8.2 1.8L1.8 8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  )
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
        className="app-titlebar__icon-btn app-titlebar__window-btn app-titlebar__window-btn--minimize no-drag"
        onClick={onMinimize}
        aria-label="Minimize window"
        title="Minimize"
      >
        <MinimizeWindowIcon />
      </button>

      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__window-btn app-titlebar__window-btn--maximize no-drag"
        onClick={onToggleMaximize}
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}
      </button>

      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__window-btn app-titlebar__window-btn--close app-titlebar__icon-btn--close no-drag"
        onClick={onClose}
        aria-label="Close window"
        title="Close"
      >
        <CloseWindowIcon />
      </button>
    </div>
  )
}
