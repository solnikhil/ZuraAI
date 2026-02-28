import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationItem from './NotificationItem'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) => !element.hasAttribute('disabled'))
}

export function NotificationPanel({ isOpen, onClose, triggerRef }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const {
    notifications,
    dismissNotification,
    markAllAsRead,
    clearAll,
  } = useNotifications()

  useEffect(() => {
    if (!isOpen) return
    markAllAsRead()
    panelRef.current?.focus()
  }, [isOpen, markAllAsRead])

  useEffect(() => {
    if (!isOpen) return

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (!panelRef.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        triggerRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return

      const focusables = getFocusableElements(panelRef.current)
      if (focusables.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      }
    }

    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  }, [isOpen, onClose, triggerRef])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className="notification-center__panel no-drag"
      role="dialog"
      aria-label="Notification Center"
      tabIndex={-1}
    >
      <header className="notification-center__panel-header">
        <div>
          <h3 className="notification-center__panel-title">Notifications</h3>
          <p className="notification-center__panel-subtitle">Recent activity and alerts</p>
        </div>

        <div className="notification-center__panel-actions">
          <button type="button" className="notification-center__text-btn" onClick={markAllAsRead}>
            Mark all as read
          </button>
          <button type="button" className="notification-center__text-btn" onClick={clearAll}>
            Clear all
          </button>
        </div>
      </header>

      <div className="notification-center__panel-list" role="list">
        {notifications.length === 0 ? (
          <div className="notification-center__empty">No notifications yet</div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onDismiss={dismissNotification}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default NotificationPanel
