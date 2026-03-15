import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

import type { AppRuntimeInfo } from '../electron'
import { Copy, Info } from './icons'
import { useToast } from './shared/Toast'
import './TitleBar.css'

function buildDetailsText(appInfo: AppRuntimeInfo | null): string {
  if (!appInfo) {
    return 'ZuraAI\nDetails are still loading.'
  }

  return [
    appInfo.appName,
    `Version: ${appInfo.appVersion}`,
    `Channel: ${appInfo.channel}`,
    `Electron: ${appInfo.electronVersion}`,
    `Chromium: ${appInfo.chromiumVersion}`,
    `Node.js: ${appInfo.nodeVersion}`,
    `V8: ${appInfo.v8Version}`,
    `OS: ${appInfo.osVersion}`,
  ].join('\n')
}

export default function AboutWindow() {
  const { showToast } = useToast()
  const [appInfo, setAppInfo] = useState<AppRuntimeInfo | null>(null)

  useEffect(() => {
    document.title = 'About ZuraAI'
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadAppInfo = async () => {
      try {
        if (!window.appInfo?.get) return
        const info = await window.appInfo.get()
        if (!cancelled) {
          setAppInfo(info)
        }
      } catch {
        if (!cancelled) {
          showToast('Unable to load app details right now.', 'error')
        }
      }
    }

    void loadAppInfo()

    return () => {
      cancelled = true
    }
  }, [showToast])

  const aboutItems = useMemo(
    () => [
      { label: 'Version', value: appInfo?.appVersion ?? 'Loading...' },
      { label: 'Channel', value: appInfo?.channel ?? 'Loading...' },
      {
        label: 'Release Track',
        value: appInfo ? (appInfo.isPackaged ? 'Installed desktop build' : 'Development session') : 'Loading...',
      },
      { label: 'Electron', value: appInfo?.electronVersion ?? 'Loading...' },
      { label: 'Chromium', value: appInfo?.chromiumVersion ?? 'Loading...' },
      { label: 'Node.js', value: appInfo?.nodeVersion ?? 'Loading...' },
      { label: 'V8', value: appInfo?.v8Version ?? 'Loading...' },
      { label: 'OS', value: appInfo?.osVersion ?? 'Loading...' },
    ],
    [appInfo]
  )

  const handleCopyDetails = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildDetailsText(appInfo))
      showToast('App details copied to your clipboard.', 'success')
    } catch {
      showToast('Could not copy the app details.', 'error')
    }
  }, [appInfo, showToast])

  const handleClose = useCallback(() => {
    if (window.windowControls?.close) {
      void window.windowControls.close()
      return
    }

    window.close()
  }, [])

  return (
    <div className="app-titlebar__about-page">
      <div className="app-titlebar__about-window-shell app-titlebar__about-window-shell--standalone">
        <div className="app-titlebar__about-window-header app-titlebar__about-window-header--standalone border-b border-[var(--theme-border)] px-5 py-4 text-left">
          <div className="app-titlebar__about-window-title-row">
            <div className="app-titlebar__about-window-icon">
              <Info size={18} />
            </div>

            <div className="app-titlebar__about-window-copy">
              <div className="text-[1rem] font-semibold text-[var(--theme-text-primary)]">
                About {appInfo?.appName ?? 'ZuraAI'}
              </div>
              <div className="text-[0.82rem] text-[var(--theme-text-secondary)]">
                {appInfo ? `Version ${appInfo.appVersion}` : 'Loading app details...'}
              </div>
            </div>
          </div>
        </div>

        <div className="app-titlebar__about-window-body px-5 py-4">
          {aboutItems.map((item) => (
            <div key={item.label} className="app-titlebar__about-window-row">
              <span className="app-titlebar__about-window-label">{item.label}</span>
              <span className="app-titlebar__about-window-value">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="app-titlebar__about-window-footer border-t border-[var(--theme-border)] px-5 py-3">
          <Button type="button" variant="outline" className="app-titlebar__about-copy-button gap-2" onClick={() => {
            void handleCopyDetails()
          }}>
            <Copy size={15} />
            Copy
          </Button>

          <Button type="button" variant="outline" className="app-titlebar__about-close-button" onClick={handleClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}
