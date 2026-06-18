import { useEffect } from 'react'

import { useSettings } from '../contexts/SettingsContext'

export default function NotificationSettingsSync() {
  const { settings } = useSettings()

  useEffect(() => {
    if (!window.emailNotifications?.applySettings) return

    void window.emailNotifications.applySettings(settings.emailNotifications).catch((error) => {
      console.warn('[NotificationSettingsSync] Failed to apply email notification settings', error)
    })
  }, [settings.emailNotifications])

  return null
}
