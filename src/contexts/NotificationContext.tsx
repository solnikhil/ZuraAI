import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { routeNotification, clampToastDuration } from '../notifications/router'
import type { Notification, NotificationPayload, NotificationContextType } from '../notifications/types'
import { useSettingsUI } from './SettingsUIContext'

const MAX_NOTIFICATIONS = 100

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

function isNotificationType(value: unknown): value is Notification['type'] {
  return value === 'success' || value === 'error' || value === 'warning' || value === 'info'
}

function isNotificationPriority(value: unknown): value is Notification['priority'] {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'critical'
}

function isNotificationPayload(payload: unknown): payload is NotificationPayload {
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
    if (action.callback !== undefined && typeof action.callback !== 'function') return false
  }

  return true
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeBannerIds, setActiveBannerIds] = useState<string[]>([])
  const { settingsUI } = useSettingsUI()

  const notificationPreferences = useMemo(() => ({
    notificationsEnabled: settingsUI.notificationsEnabled,
    nativeNotificationsEnabled: settingsUI.nativeNotificationsEnabled,
    toastDuration: settingsUI.toastDuration,
    doNotDisturb: settingsUI.doNotDisturb,
  }), [
    settingsUI.notificationsEnabled,
    settingsUI.nativeNotificationsEnabled,
    settingsUI.toastDuration,
    settingsUI.doNotDisturb,
  ])

  const toastDurationMs = useMemo(
    () => clampToastDuration(notificationPreferences.toastDuration),
    [notificationPreferences.toastDuration]
  )

  const addNotification = useCallback((payload: NotificationPayload) => {
    if (!isNotificationPayload(payload)) {
      console.warn('[NotificationContext] Invalid notification payload received:', payload)
      return
    }

    const notification: Notification = {
      ...payload,
      id: crypto.randomUUID(),
      priority: payload.priority ?? 'normal',
      timestamp: Date.now(),
      read: false,
    }

    const isWindowFocused = typeof document !== 'undefined' ? document.hasFocus() : true
    const decision = routeNotification(notification, notificationPreferences, isWindowFocused)

    if (!notificationPreferences.notificationsEnabled && notification.priority !== 'critical') {
      return
    }

    setNotifications(prev => {
      const next = [notification, ...prev].sort((a, b) => b.timestamp - a.timestamp)
      if (next.length > MAX_NOTIFICATIONS) {
        return next.slice(0, MAX_NOTIFICATIONS)
      }
      return next
    })

    if (decision.showBanner) {
      setActiveBannerIds(prev => {
        const next = [notification.id, ...prev.filter(id => id !== notification.id)]
        return next.slice(0, MAX_NOTIFICATIONS)
      })
    }

    if (decision.showToast) {
      const toastOptions = {
        duration: toastDurationMs,
        description: notification.body,
        action: notification.action
          ? {
              label: notification.action.label,
              onClick: () => {
                try {
                  notification.action?.callback?.()
                } catch (error) {
                  console.error('[NotificationContext] Notification action failed:', error)
                }
              },
            }
          : undefined,
      }

      switch (notification.type) {
        case 'success':
          toast.success(notification.title, toastOptions)
          break
        case 'error':
          toast.error(notification.title, toastOptions)
          break
        case 'warning':
          toast.warning(notification.title, toastOptions)
          break
        case 'info':
        default:
          toast.info(notification.title, toastOptions)
          break
      }
    }

    if (decision.showNative && window.ipcRenderer) {
      void window.ipcRenderer
        .invoke('notification:native', {
          notificationId: notification.id,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          priority: notification.priority,
        })
        .catch((error) => {
          console.warn('[NotificationContext] Native notification failed:', error)
        })
    }
  }, [notificationPreferences, toastDurationMs])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    setActiveBannerIds(prev => prev.filter(bannerId => bannerId !== id))
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    )
    setActiveBannerIds(prev => prev.filter(bannerId => bannerId !== id))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })))
    setActiveBannerIds([])
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    setActiveBannerIds([])
  }, [])

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  )

  const activeBanners = useMemo(() => {
    const byId = new Map(notifications.map(notification => [notification.id, notification]))
    return activeBannerIds
      .map(id => byId.get(id))
      .filter((notification): notification is Notification => {
        if (!notification) return false
        if (notification.read) return false
        return notification.priority === 'high' || notification.priority === 'critical'
      })
  }, [activeBannerIds, notifications])

  React.useEffect(() => {
    if (!window.notifications?.onPush) {
      return
    }

    const unsubscribe = window.notifications.onPush((payload) => {
      if (!isNotificationPayload(payload)) {
        console.warn('[NotificationContext] Dropped malformed IPC notification payload:', payload)
        return
      }
      addNotification(payload)
    })

    return unsubscribe
  }, [addNotification])

  const contextValue = useMemo<NotificationContextType>(
    () => ({
      notifications,
      activeBanners,
      unreadCount,
      addNotification,
      dismissNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    }),
    [
      notifications,
      activeBanners,
      unreadCount,
      addNotification,
      dismissNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    ]
  )

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotificationStore(): NotificationContextType {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotificationStore must be used within a NotificationProvider')
  }
  return context
}
