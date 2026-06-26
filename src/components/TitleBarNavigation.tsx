import { ChevronLeft, ChevronRight } from './icons'
import { TooltipIconButton } from './ui/TooltipIconButton'

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
      <TooltipIconButton
        tooltip="Back"
        className="app-titlebar__icon-btn app-titlebar__icon-btn--nav"
        onClick={onBack}
        aria-label="Go back"
        disabled={!canGoBack}
      >
        <ChevronLeft size={16} />
      </TooltipIconButton>

      <TooltipIconButton
        tooltip="Forward"
        className="app-titlebar__icon-btn app-titlebar__icon-btn--nav"
        onClick={onForward}
        aria-label="Go forward"
        disabled={!canGoForward}
      >
        <ChevronRight size={16} />
      </TooltipIconButton>
    </div>
  )
}
