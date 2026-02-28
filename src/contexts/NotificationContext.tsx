/**
 * NotificationContext - Centralized notification state management
 *
 * Provides CRUD operations for notifications with:
 * - UUID generation for unique IDs
 * - Timestamp-descending sort order
 * - 100-entry cap (oldest removed on overflow)
 * - Memoized context value to prevent unnecessary re-renders
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { Notification, NotificationPayload, NotificationContextType } from '../notifications/types'

const MAX_NOTIFICATIONS = 100

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const addNotification = useCallback((payload: NotificationPayload) => {
    const notification: Notification = {
      ...payload,
      id: crypto.randomUUID(),
      priority: payload.priority ?? 'normal',
      timestamp: Date.now(),
      read: false,
    }

    setNotifications(prev => {
      const next = [notification, ...prev].sort((a, b) => b.timestamp - a.timestamp)
      // Enforce 100-entry cap — remove oldest (last in desc-sorted array)
      if (next.length > MAX_NOTIFICATIONS) {
        return next.slice(0, MAX_NOTIFICATIONS)
      }
      return next
    })
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  )

  const contextValue = useMemo<NotificationContextType>(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      dismissNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    }),
    [notifications, unreadCount, addNotification, dismissNotification, markAsRead, markAllAsRead, clearAll]
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
