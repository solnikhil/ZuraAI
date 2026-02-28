import type { ReactElement } from 'react'
import { AlertTriangle, CheckCircle, Info, X, XCircle } from '../icons'
import type { Notification } from '../../notifications/types'
import { formatRelativeTimestamp } from '../../notifications/time'

interface NotificationItemProps {
  notification: Notification
  onDismiss: (id: string) => void
  onAction?: (id: string) => void
}

function NotificationTypeIcon({ type }: { type: Notification['type'] }): ReactElement {
  if (type === 'success') return <CheckCircle size={16} />
  if (type === 'error') return <XCircle size={16} />
  if (type === 'warning') return <AlertTriangle size={16} />
  return <Info size={16} />
}

export function NotificationItem({ notification, onDismiss, onAction }: NotificationItemProps) {
  const relativeTime = formatRelativeTimestamp(notification.timestamp)

  return (
    <article className="notification-center__item" data-priority={notification.priority}>
      <div className="notification-center__item-icon" data-testid="notification-item-icon" aria-hidden="true">
        <NotificationTypeIcon type={notification.type} />
      </div>

      <div className="notification-center__item-body">
        <div className="notification-center__item-header">
          <h4 className="notification-center__item-title">{notification.title}</h4>
          <span className="notification-center__item-time" title={new Date(notification.timestamp).toLocaleString()}>
            {relativeTime}
          </span>
        </div>

        <p className="notification-center__item-text">{notification.body}</p>

        {notification.action && (
          <button
            type="button"
            className="notification-center__action-btn"
            onClick={() => {
              try {
                notification.action?.callback?.()
                onAction?.(notification.id)
              } catch (error) {
                console.error('[NotificationItem] Action callback failed:', error)
              }
            }}
          >
            {notification.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        className="notification-center__dismiss-btn"
        onClick={() => onDismiss(notification.id)}
        aria-label={`Dismiss ${notification.title}`}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </article>
  )
}

export default NotificationItem
