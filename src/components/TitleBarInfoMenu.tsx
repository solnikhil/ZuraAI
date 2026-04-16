import { useCallback, useEffect, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { AppRuntimeInfo } from '../electron/types'
import { List } from './icons'
import { useToast } from './shared/Toast'

type UpdateState = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloaded' | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractUpdateVersion(result: unknown): string | null {
  if (!isRecord(result)) return null

  // checkForUpdates() now returns UpdateInfo directly from the main process
  const version = result.version
  if (typeof version === 'string' && version.trim().length > 0) return version

  // Fallback: handle wrapped { updateInfo: { version } } shape
  const updateInfo = result.updateInfo
  if (!isRecord(updateInfo)) return null
  const nestedVersion = updateInfo.version
  return typeof nestedVersion === 'string' && nestedVersion.trim().length > 0
    ? nestedVersion
    : null
}

interface TitleBarInfoMenuProps {
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  setDashboardView: (view: 'chat' | 'settings') => void
}

export default function TitleBarInfoMenu({
  hasUnsavedSettings,
  isSettingsView,
  setDashboardView,
}: TitleBarInfoMenuProps) {
  const { showToast } = useToast()
  const [appInfo, setAppInfo] = useState<AppRuntimeInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')

  const loadAppInfo = useCallback(async () => {
    try {
      if (!window.appInfo?.get) return
      const info = await window.appInfo.get()
      setAppInfo(info)
    } catch {
      showToast('Unable to load app details right now.', 'error')
    }
  }, [showToast])

  useEffect(() => {
    void loadAppInfo()
  }, [loadAppInfo])

  useEffect(() => {
    if (!window.updater) return

    const removeAvailableListener = window.updater.onUpdateAvailable((version) => {
      setUpdateState('available')
      showToast(`Update v${version} found. Downloading now...`, 'info')
    })

    const removeDownloadedListener = window.updater.onUpdateDownloaded((version) => {
      setUpdateState('downloaded')
      showToast(`Update v${version} ready. Install it from the info menu.`, 'success')
    })

    return () => {
      removeAvailableListener()
      removeDownloadedListener()
    }
  }, [showToast])

  const isPackaged = appInfo?.isPackaged ?? false
  const settingsButtonDisabled = isSettingsView && hasUnsavedSettings

  const handleCheckForUpdates = useCallback(async () => {
    if (!window.updater) {
      showToast('Updater is not available in this environment.', 'error')
      return
    }

    if (!isPackaged) {
      showToast('Update checks are available in packaged desktop builds.', 'info')
      return
    }

    if (updateState === 'downloaded') {
      showToast('Restarting ZuraAI to install the update...', 'info')
      await window.updater.quitAndInstall()
      return
    }

    setUpdateState('checking')

    try {
      const currentVersion = appInfo?.appVersion ?? (await window.updater.getVersion())
      const result = await window.updater.checkForUpdates()
      const nextVersion = extractUpdateVersion(result)

      if (nextVersion && nextVersion !== currentVersion) {
        setUpdateState('available')
        return
      }

      setUpdateState('upToDate')
      showToast('ZuraAI is already up to date.', 'success')
    } catch {
      setUpdateState('error')
      showToast('Unable to check for updates right now.', 'error')
    }
  }, [appInfo?.appVersion, isPackaged, showToast, updateState])

  const handleOpenAbout = useCallback(() => {
    if (!window.appInfo?.openAboutWindow) {
      showToast('About window is not available in this environment.', 'error')
      return
    }

    void window.appInfo.openAboutWindow().catch(() => {
      showToast('Unable to open the About window right now.', 'error')
    })
  }, [showToast])

  const handleSettingsToggle = useCallback(() => {
    if (isSettingsView) {
      if (!hasUnsavedSettings) {
        setDashboardView('chat')
      }
      return
    }

    setDashboardView('settings')
  }, [hasUnsavedSettings, isSettingsView, setDashboardView])

const handleToggleOverlay = useCallback(() => {
    if (!window.overlay?.toggle) {
      showToast('Overlay is not available in this environment.', 'error')
      return
    }

    void window.overlay.toggle().then((state) => {
      if (!state.enabled) {
        showToast('Enable Overlay in Extension settings before opening it.', 'warning')
      }
    }).catch(() => {
      showToast('Unable to toggle the Overlay right now.', 'error')
    })
  }, [showToast])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="app-titlebar__icon-btn app-titlebar__info-trigger no-drag"
          aria-label="Open app info menu"
          title="App info"
        >
          <List size={16} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-52 rounded-lg border border-border/80 bg-popover p-1"
      >
        <DropdownMenuItem
          className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs"
          onSelect={handleToggleOverlay}
        >
          <span className="truncate">Overlay</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="-mx-1 my-1" />

        <DropdownMenuItem
          className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs"
          disabled={settingsButtonDisabled}
          onSelect={() => {
            handleSettingsToggle()
          }}
        >
          <span className="truncate">
            {settingsButtonDisabled
              ? 'Save or discard changes first'
              : isSettingsView
                ? 'Back to chat'
                : 'Settings'}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="-mx-1 my-1" />

        <DropdownMenuItem
          className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs"
          onSelect={handleOpenAbout}
        >
          <span className="truncate">About</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs"
          disabled={updateState === 'checking'}
          onSelect={() => {
            void handleCheckForUpdates()
          }}
        >
          <span className="truncate">
            {updateState === 'downloaded' ? 'Install Update' : 'Check for Updates'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
