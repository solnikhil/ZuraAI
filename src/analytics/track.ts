import type { AnalyticsEventName, AnalyticsProperties } from '../electron/types'

export function trackAnalytics(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties
): void {
  if (typeof window === 'undefined' || !window.analytics?.track) return

  void window.analytics.track(eventName, properties).catch(() => undefined)
}

export function trackRendererError(
  category: string,
  code: string = 'renderer_error',
  fatal = false
): void {
  trackAnalytics('app_error', {
    category,
    code,
    processType: 'renderer',
    fatal,
  })
}
