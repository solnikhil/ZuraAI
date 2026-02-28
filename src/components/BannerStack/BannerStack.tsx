import { useMemo } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import Banner from './Banner'
import './BannerStack.css'

const MAX_VISIBLE_BANNERS = 3

export function BannerStack() {
  const { activeBanners } = useNotifications()

  const { visibleBanners, overflowCount } = useMemo(() => {
    const visible = activeBanners.slice(0, MAX_VISIBLE_BANNERS)
    return {
      visibleBanners: visible,
      overflowCount: Math.max(0, activeBanners.length - visible.length),
    }
  }, [activeBanners])

  if (visibleBanners.length === 0) {
    return null
  }

  return (
    <div className="notification-banner-stack" role="status" aria-live="polite">
      {visibleBanners.map((notification) => (
        <Banner key={notification.id} notification={notification} />
      ))}

      {overflowCount > 0 && (
        <div className="notification-banner-stack__overflow">+{overflowCount} more alert(s)</div>
      )}
    </div>
  )
}

export default BannerStack
