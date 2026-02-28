import type { Notification } from '../../notifications/types'
import { useNotifications } from '../../hooks/useNotifications'

interface BannerProps {
  notification: Notification
}

export function Banner({ notification }: BannerProps) {
  const { markAsRead } = useNotifications()

  return (
    <section className="notification-banner" data-priority={notification.priority}>
      <div className="notification-banner__content">
        <h4 className="notification-banner__title">{notification.title}</h4>
        <p className="notification-banner__body">{notification.body}</p>
      </div>

      <div className="notification-banner__actions">
        {notification.action && (
          <button
            type="button"
            className="notification-banner__action-btn"
            onClick={() => {
              try {
                notification.action?.callback?.()
              } catch (error) {
                console.error('[Banner] Action callback failed:', error)
              }
            }}
          >
            {notification.action.label}
          </button>
        )}

        <button
          type="button"
          className="notification-banner__dismiss-btn"
          onClick={() => markAsRead(notification.id)}
          aria-label={`Dismiss ${notification.title}`}
        >
          Dismiss
        </button>
      </div>
    </section>
  )
}

export default Banner
