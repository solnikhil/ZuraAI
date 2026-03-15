import { useCallback, useEffect, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { AppRuntimeInfo } from '../electron'
import { CheckCircle, Info, Loader2, ShieldCheck } from './icons'
import { useToast } from './shared/Toast'

type UpdateState = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloaded' | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractUpdateVersion(result: unknown): string | null {
  if (!isRecord(result)) return null

  const updateInfo = result.updateInfo
  if (!isRecord(updateInfo)) return null

  const version = updateInfo.version
  return typeof version === 'string' && version.trim().length > 0 ? version : null
}

export default function TitleBarInfoMenu() {
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

    const removeAvailableListener = window.updater.onUpdateAvailable(() => {
      setUpdateState('available')
      showToast('Update found. ZuraAI is downloading it now.', 'info')
    })

    const removeDownloadedListener = window.updater.onUpdateDownloaded(() => {
      setUpdateState('downloaded')
      showToast('Update downloaded. You can install it from the info menu.', 'success')
    })

    return () => {
      removeAvailableListener()
      removeDownloadedListener()
    }
  }, [showToast])

  const isPackaged = appInfo?.isPackaged ?? false

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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="app-titlebar__icon-btn app-titlebar__info-trigger no-drag"
            aria-label="Open app info menu"
            title="App info"
          >
            <span className="app-titlebar__info-trigger-core">
              <Info size={14} />
            </span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="app-titlebar__info-menu p-1.5">
          <DropdownMenuItem
            className="app-titlebar__info-menu-item app-titlebar__info-menu-item--compact"
            disabled={updateState === 'checking'}
            onSelect={() => {
              void handleCheckForUpdates()
            }}
          >
            <span className="app-titlebar__info-menu-item-icon app-titlebar__info-menu-item-icon--compact">
              {updateState === 'checking' ? (
                <Loader2 size={14} className="app-titlebar__spin" />
              ) : updateState === 'downloaded' ? (
                <CheckCircle size={14} />
              ) : (
                <ShieldCheck size={14} />
              )}
            </span>

            <span className="app-titlebar__info-menu-item-title">
              {updateState === 'downloaded' ? 'Install Update' : 'Check for Updates...'}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="app-titlebar__info-menu-item app-titlebar__info-menu-item--compact"
            onSelect={handleOpenAbout}
          >
            <span className="app-titlebar__info-menu-item-icon app-titlebar__info-menu-item-icon--compact app-titlebar__info-menu-item-icon--about">
              <Info size={14} />
            </span>

            <span className="app-titlebar__info-menu-item-title">About ZuraAI</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
