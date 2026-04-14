import { ChevronLeft, ChevronRight } from './icons'

interface TitleBarNavigationProps {
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
}

export default function TitleBarNavigation({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: TitleBarNavigationProps) {
  return (
    <div className="app-titlebar__controls app-titlebar__nav-cluster no-drag">
      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__icon-btn--nav"
        onClick={onBack}
        aria-label="Go back"
        title="Back"
        disabled={!canGoBack}
      >
        <ChevronLeft size={16} />
      </button>

      <button
        type="button"
        className="app-titlebar__icon-btn app-titlebar__icon-btn--nav"
        onClick={onForward}
        aria-label="Go forward"
        title="Forward"
        disabled={!canGoForward}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
