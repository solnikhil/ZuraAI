import { useNotificationStore } from '../contexts/NotificationContext'

export function useNotifications() {
  const {
    notifications,
    activeBanners,
    unreadCount,
    addNotification,
    dismissNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotificationStore()

  return {
    notifications,
    activeBanners,
    unreadCount,
    addNotification,
    dismissNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  }
}
