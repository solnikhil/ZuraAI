import { useEffect } from 'react'
import { useAppShell } from '../../contexts/AppShellContext'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function useMouseNavigation() {
  const { canGoBack, canGoForward, goBack, goForward } = useAppShell()

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return
      }

      if (event.button === 3) {
        if (!canGoBack) {
          return
        }

        event.preventDefault()
        goBack()
        return
      }

      if (event.button === 4) {
        if (!canGoForward) {
          return
        }

        event.preventDefault()
        goForward()
      }
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [canGoBack, canGoForward, goBack, goForward])
}
