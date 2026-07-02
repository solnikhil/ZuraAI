import { preloadSettings } from '../components/Settings/settingsLoader'
import { preloadMarkdown } from './markdownPreloader'

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number }
    ) => number
  }

function scheduleWhenIdle(task: () => void, timeout: number): void {
  const idleWindow = window as IdleWindow

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(task, { timeout })
    return
  }

  window.setTimeout(task, Math.min(timeout, 500))
}

export function scheduleNonCriticalPreloads(): void {
  if (typeof window === 'undefined') {
    return
  }

  scheduleWhenIdle(() => {
    void preloadSettings()
  }, 1800)

  scheduleWhenIdle(() => {
    void preloadMarkdown()
  }, 4500)
}
