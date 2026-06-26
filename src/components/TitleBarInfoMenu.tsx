import { useCallback, useEffect, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { AppRuntimeInfo } from '../electron/types'
import type { DashboardView } from '../contexts/AppShellContext'
import { ArrowLeft, Clock, Info, List, Loader2, MessageCircle, SettingsIcon } from './icons'
import { useToast } from './shared/Toast'
import { isMacOSRuntime } from '@/utils/platform'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { TooltipIconButton } from './ui/TooltipIconButton'

import type { UpdateCheckInfo } from '@/electron/types'

type UpdateState = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloaded' | 'error'

function extractUpdateVersion(result: UpdateCheckInfo | null): string | null {
  if (!result) return null
  const version = result.version
  return typeof version === 'string' && version.trim().length > 0 ? version : null
}

/**
 * Pure label resolver for the "Check for Updates" dropdown row.
 * Exported so tests can cover all states without driving Radix popovers in jsdom.
 */
export function getUpdateMenuLabel(state: UpdateState, percent: number | null): string {
  if (state === 'downloaded') return 'Install Update'
  if (state === 'error') return 'Try again'
  if (state === 'available') {
    if (percent === null) return 'Downloading update…'
    const rounded = Math.max(0, Math.min(100, Math.round(percent)))
    return `Downloading update… ${rounded}%`
  }
  if (state === 'checking') return 'Checking…'
  return 'Check for Updates'
}

interface TitleBarInfoMenuProps {
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  setDashboardView: (view: DashboardView) => void
  triggerVariant?: 'titlebar' | 'sidebar'
  sidebarCollapsed?: boolean
}

export default function TitleBarInfoMenu({
  hasUnsavedSettings,
  isSettingsView,
  setDashboardView,
  triggerVariant = 'titlebar',
  sidebarCollapsed = false,
}: TitleBarInfoMenuProps) {
  const { showToast } = useToast()
  const [appInfo, setAppInfo] = useState<AppRuntimeInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)

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
      setDownloadPercent(null)
      showToast(`Update v${version} found. Downloading now...`, 'info')
    })

    const removeDownloadedListener = window.updater.onUpdateDownloaded((version) => {
      setUpdateState('downloaded')
      setDownloadPercent(null)
      showToast(`Update v${version} ready. Install it from the info menu.`, 'success')
    })

    const removeErrorListener = window.updater.onUpdateError((message) => {
      setUpdateState('error')
      setDownloadPercent(null)
      showToast(`Update failed: ${message || 'unknown error'}`, 'error')
    })

    const removeProgressListener = window.updater.onUpdateProgress((progress) => {
      // electron-updater can emit 0% during the initial probe — treat that as
      // "downloading started" but suppress the noisy 0% label by clamping to 1.
      const clamped = Math.max(0, Math.min(100, progress.percent ?? 0))
      setDownloadPercent(clamped)
    })

    return () => {
      removeAvailableListener()
      removeDownloadedListener()
      removeErrorListener()
      removeProgressListener()
    }
  }, [showToast])

  const isPackaged = appInfo?.isPackaged ?? false
  const overlayAvailable = !isMacOSRuntime()
  const settingsButtonDisabled = isSettingsView && hasUnsavedSettings
  const isSidebarTrigger = triggerVariant === 'sidebar'
  const updateBusy = updateState === 'checking' || updateState === 'available'
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

    void window.overlay
      .toggle()
      .then((state) => {
        if (!state.enabled) {
          showToast('Enable Overlay in Extension settings before opening it.', 'warning')
        }
      })
      .catch(() => {
        showToast('Unable to toggle the Overlay right now.', 'error')
      })
  }, [showToast])

  if (isSidebarTrigger && isSettingsView) {
    return (
      <TooltipIconButton
        tooltip="Back to chat"
        className="sidebar-header__btn sidebar-footer-row"
        aria-label="Back to chat"
        onClick={handleSettingsToggle}
      >
        <span className="sidebar-header__icon-slot" aria-hidden="true">
          <ArrowLeft size={16} className="sidebar-header__icon" />
        </span>
        {!sidebarCollapsed ? <span className="sidebar-header__label">Back to chat</span> : null}
      </TooltipIconButton>
    )
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            {isSidebarTrigger ? (
              <button
                type="button"
                className="sidebar-header__btn sidebar-footer-row"
                aria-label="Open app menu"
              >
                <span className="sidebar-header__icon-slot" aria-hidden="true">
                  <SettingsIcon size={16} className="sidebar-header__icon" />
                </span>
                {!sidebarCollapsed ? <span className="sidebar-header__label">Settings</span> : null}
              </button>
            ) : (
              <button
                type="button"
                className="app-titlebar__icon-btn app-titlebar__info-trigger no-drag"
                aria-label="Open app info menu"
              >
                <List size={16} />
              </button>
            )}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{isSidebarTrigger ? 'Settings' : 'App info'}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        side={isSidebarTrigger ? 'top' : 'bottom'}
        align={isSidebarTrigger ? 'start' : 'end'}
        sideOffset={isSidebarTrigger ? 6 : 8}
        collisionPadding={12}
        className={
          isSidebarTrigger
            ? 'zura-menu-surface--compact min-w-[var(--radix-dropdown-menu-trigger-width)]'
            : 'zura-menu-surface--compact w-60'
        }
      >
        <DropdownMenuLabel>App</DropdownMenuLabel>

        {overlayAvailable ? (
          <DropdownMenuItem className="zura-menu-item--compact" onSelect={handleToggleOverlay}>
            <MessageCircle size={16} />
            <span>Overlay</span>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          className="zura-menu-item--compact"
          disabled={settingsButtonDisabled}
          onSelect={() => {
            handleSettingsToggle()
          }}
        >
          <SettingsIcon size={16} />
          <span className="truncate">
            {settingsButtonDisabled
              ? 'Save or discard changes first'
              : isSettingsView
                ? 'Back to chat'
                : 'Settings'}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>About</DropdownMenuLabel>

        <DropdownMenuItem className="zura-menu-item--compact" onSelect={handleOpenAbout}>
          <Info size={16} />
          <span>About</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="zura-menu-item--compact"
          disabled={updateState === 'checking'}
          onSelect={() => {
            void handleCheckForUpdates()
          }}
        >
          <Clock size={16} />
          <span className="flex-1 truncate">
            {getUpdateMenuLabel(updateState, downloadPercent)}
          </span>
          {updateBusy ? (
            <Loader2 size={14} className="shrink-0 animate-spin opacity-70" aria-hidden="true" />
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
