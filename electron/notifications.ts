import type { BrowserWindow } from 'electron'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'

export interface NotificationBridgePayload {
  type: NotificationType
  priority?: NotificationPriority
  title: string
  body: string
  action?: {
    label: string
  }
}

function isNotificationType(value: unknown): value is NotificationType {
  return value === 'success' || value === 'error' || value === 'warning' || value === 'info'
}

function isNotificationPriority(value: unknown): value is NotificationPriority {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'critical'
}

export function isValidNotificationBridgePayload(payload: unknown): payload is NotificationBridgePayload {
  if (typeof payload !== 'object' || payload === null) return false

  const candidate = payload as Record<string, unknown>
  if (!isNotificationType(candidate.type)) return false
  if (typeof candidate.title !== 'string' || candidate.title.length === 0) return false
  if (typeof candidate.body !== 'string' || candidate.body.length === 0) return false

  if (candidate.priority !== undefined && !isNotificationPriority(candidate.priority)) {
    return false
  }

  if (candidate.action !== undefined) {
    if (typeof candidate.action !== 'object' || candidate.action === null) return false
    const action = candidate.action as Record<string, unknown>
    if (typeof action.label !== 'string' || action.label.length === 0) return false
  }

  return true
}

export function pushNotification(
  mainWindow: BrowserWindow | null,
  payload: unknown,
): boolean {
  if (!isValidNotificationBridgePayload(payload)) {
    console.warn('[NotificationBridge] Invalid payload:', payload)
    return false
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return false
  }

  mainWindow.webContents.send('notification:push', payload)
  return true
}
