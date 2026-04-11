import { useEffect, useRef } from 'react'

import { useSettings } from '../contexts/SettingsContext'

export default function OverlaySync() {
  const { settings } = useSettings()
  const didRunInitialSyncRef = useRef(false)

  useEffect(() => {
    if (!window.overlay?.applySettings) return

    void window.overlay.applySettings(settings.overlay).catch((error) => {
      console.warn('[OverlaySync] Failed to apply overlay settings', error)
    })

    if (!didRunInitialSyncRef.current) {
      didRunInitialSyncRef.current = true
      if (window.location.hash !== '#/overlay' && settings.overlay.enabled && settings.overlay.launchOnStartup) {
        void window.overlay.show().catch((error) => {
          console.warn('[OverlaySync] Failed to auto-open overlay on startup', error)
        })
      }
    }
  }, [settings.overlay])

  return null
}