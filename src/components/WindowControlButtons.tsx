import type { ReactElement } from 'react'

export interface WindowControlButtonsProps {
  isMaximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}

function MinimizeWindowIcon({ size = 12 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 5.5H9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="butt" />
    </svg>
  )
}

function MaximizeWindowIcon({ size = 12 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function RestoreWindowIcon({ size = 12 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3.5 1.5H8.5V6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="butt" />
      <rect x="1.5" y="3.5" width="5" height="5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function CloseWindowIcon({ size = 12 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.4 1.4L8.6 8.6" stroke="currentColor" strokeWidth="1.15" strokeLinecap="butt" />
      <path d="M8.6 1.4L1.4 8.6" stroke="currentColor" strokeWidth="1.15" strokeLinecap="butt" />
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
        className="app-titlebar__icon-btn app-titlebar__window-btn app-titlebar__window-btn--close no-drag"
        onClick={onClose}
        aria-label="Close window"
        title="Close"
      >
        <CloseWindowIcon />
      </button>
    </div>
  )
}
