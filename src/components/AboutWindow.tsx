import { useEffect, useMemo, useState } from 'react'

import type { AppRuntimeInfo } from '../electron'
import './TitleBar.css'

export default function AboutWindow() {
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
      } catch {}
    }

    void loadAppInfo()

    return () => {
      cancelled = true
    }
  }, [])

  const aboutSections = useMemo(
    () => [
      {
        title: 'Build',
        items: [
          { label: 'Version', value: appInfo?.appVersion ?? 'Loading...' },
          { label: 'Channel', value: appInfo?.channel ?? 'Loading...' },
          {
            label: 'Release Track',
            value: appInfo
              ? appInfo.isPackaged
                ? 'Installed desktop build'
                : 'Development session'
              : 'Loading...',
          },
        ],
      },
      {
        title: 'Runtime',
        items: [
          { label: 'Electron', value: appInfo?.electronVersion ?? 'Loading...' },
          { label: 'Chromium', value: appInfo?.chromiumVersion ?? 'Loading...' },
          { label: 'Node.js', value: appInfo?.nodeVersion ?? 'Loading...' },
          { label: 'V8', value: appInfo?.v8Version ?? 'Loading...' },
          { label: 'OS', value: appInfo?.osVersion ?? 'Loading...' },
        ],
      },
    ],
    [appInfo]
  )

  return (
    <div className="app-titlebar__about-page">
      <div className="app-titlebar__about-window-shell app-titlebar__about-window-shell--standalone">
        <div className="app-titlebar__about-window-header app-titlebar__about-window-header--standalone border-b border-[var(--theme-border)] px-5 py-4 text-left">
          <div className="app-titlebar__about-window-title-row">
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
          <div className="app-titlebar__about-window-sections">
            {aboutSections.map((section) => (
              <section key={section.title} className="app-titlebar__about-window-section">
                <div className="app-titlebar__about-window-section-title">{section.title}</div>
                <div className="app-titlebar__about-window-section-list">
                  {section.items.map((item) => (
                    <div key={item.label} className="app-titlebar__about-window-row">
                      <span className="app-titlebar__about-window-label">{item.label}</span>
                      <span className="app-titlebar__about-window-value">{item.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
