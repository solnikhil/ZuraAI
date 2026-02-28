import { useEffect, useRef, useState } from 'react'
import { Bell } from '../icons'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationPanel from './NotificationPanel'
import './NotificationCenter.css'

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { unreadCount } = useNotifications()

  useEffect(() => {
    if (!window.notifications?.onNativeClick) return

    return window.notifications.onNativeClick(() => {
      setIsOpen(true)
    })
  }, [])

  return (
    <div className="notification-center no-drag">
      <button
        ref={triggerRef}
        type="button"
        className="app-titlebar__icon-btn notification-center__bell"
        aria-label="Open notifications"
        title="Notifications"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="notification-center__badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
      />
    </div>
  )
}

export default NotificationBell
