import { useEffect } from 'react'

import { useSettings } from '../contexts/SettingsContext'
import { isWindowsRuntime } from '../utils/platform'

/**
 * AgentDesktopSync
 *
 * Renderer-side bridge that mirrors persisted `settings.agentDesktop` into the
 * trusted main-process Agent Desktop service through the dedicated
 * `window.agentDesktop` preload bridge, mirroring `OverlaySync`.
 *
 * Windows-only: Agent Desktop is disabled on macOS / non-Windows platforms, so
 * this component renders nothing and performs no mirroring there (defense in
 * depth alongside the Windows-only provider-tree mount). Req 9.3.
 *
 * The mirror runs whenever `settings.agentDesktop` changes. The effect fires
 * synchronously after render, well within `SETTINGS_MIRROR_TIMEOUT_MS` (1000ms)
 * of the change. Req 10.6.
 */
export default function AgentDesktopSync() {
  const { settings } = useSettings()

  useEffect(() => {
    if (!isWindowsRuntime()) return
    if (!window.agentDesktop?.applySettings) return
    // Nothing to mirror until the user has interacted with Agent Desktop
    // settings; the service retains its safe disabled default until then.
    if (!settings.agentDesktop) return

    void window.agentDesktop.applySettings(settings.agentDesktop).catch((error) => {
      console.warn('[AgentDesktopSync] Failed to apply Agent Desktop settings', error)
    })
  }, [settings.agentDesktop])

  return null
}
