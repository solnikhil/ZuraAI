import type { Notification, NotificationPreferences, RenderDecision } from './types'

/**
 * Clamp a toast duration value to the valid range [2000, 10000] ms.
 */
export function clampToastDuration(duration: number): number {
  return Math.min(10000, Math.max(2000, duration))
}

/**
 * Pure function that determines how a notification should be rendered
 * based on its priority and the user's preferences.
 *
 * Routing rules:
 *  - low / normal  → toast only
 *  - high          → banner only
 *  - critical      → toast + banner + native (when window is unfocused)
 *
 * Preference overrides:
 *  - notificationsEnabled=false  → suppress everything except critical
 *  - doNotDisturb=true           → suppress toast & banner (store still receives)
 *  - nativeNotificationsEnabled=false → suppress native regardless
 */
export function routeNotification(
  notification: Notification,
  preferences: NotificationPreferences,
  isWindowFocused: boolean,
): RenderDecision {
  const { priority } = notification
  const {
    notificationsEnabled,
    doNotDisturb,
    nativeNotificationsEnabled,
  } = preferences

  // When notifications are globally disabled, suppress all non-critical
  if (!notificationsEnabled && priority !== 'critical') {
    return { showToast: false, showBanner: false, showNative: false }
  }

  // Base routing by priority
  let showToast = false
  let showBanner = false
  let showNative = false

  switch (priority) {
    case 'low':
    case 'normal':
      showToast = true
      break
    case 'high':
      showBanner = true
      break
    case 'critical':
      showToast = true
      showBanner = true
      showNative = !isWindowFocused
      break
  }

  // DND suppresses toast and banner rendering
  if (doNotDisturb) {
    showToast = false
    showBanner = false
  }

  // Native preference override
  if (!nativeNotificationsEnabled) {
    showNative = false
  }

  return { showToast, showBanner, showNative }
}
