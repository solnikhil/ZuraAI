// Notification system type definitions

// --- Union types ---

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'

export interface NotificationAction {
  label: string
  callback?: () => void
}

// --- Core interfaces ---

export interface Notification {
  id: string
  type: NotificationType
  priority: NotificationPriority
  title: string
  body: string
  timestamp: number
  read: boolean
  action?: NotificationAction
}

/** Input payload for creating a notification (id, timestamp, read are auto-assigned). */
export type NotificationPayload = Omit<Notification, 'id' | 'timestamp' | 'read' | 'priority'> & {
  priority?: NotificationPriority
}

export interface NotificationPreferences {
  notificationsEnabled: boolean
  nativeNotificationsEnabled: boolean
  toastDuration: number
  doNotDisturb: boolean
}

export interface RenderDecision {
  showToast: boolean
  showBanner: boolean
  showNative: boolean
}

export interface NotificationContextType {
  notifications: Notification[]
  activeBanners: Notification[]
  unreadCount: number
  addNotification: (payload: NotificationPayload) => void
  dismissNotification: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
}
