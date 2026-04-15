import { useEffect, useState } from 'react'

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
      } catch (error) {
        console.warn('[AboutWindow] Failed to load app runtime info', error)
      }
    }

    void loadAppInfo()

    return () => {
      cancelled = true
    }
  }, [])

  const getRelativeTime = (dateStr: string) => {
    if (dateStr === 'unknown') return ''

    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return ''

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return '(today)'
    if (diffDays === 1) return '(1 day ago)'
    return `(${diffDays} days ago)`
  }

  const InfoRow = ({ 
    label, 
    value, 
    highlight = false 
  }: { 
    label: string
    value: string
    highlight?: boolean 
  }) => (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${highlight ? 'bg-[var(--theme-surface-hover)]' : ''}`}>
      <span className="text-[0.8rem] text-[var(--theme-text-secondary)] font-medium">{label}</span>
      <span className="text-[0.85rem] text-[var(--theme-text-primary)] font-mono">{value}</span>
    </div>
  )

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3 mt-4">
      <div className="w-1 h-4 bg-[var(--theme-text-primary)] rounded-full" />
      <span className="text-[0.75rem] uppercase tracking-wider text-[var(--theme-text-secondary)] font-semibold">
        {children}
      </span>
    </div>
  )

  return (
    <div className="app-titlebar__about-page h-screen overflow-y-auto flex items-start justify-center p-6 py-10">
      <div className="w-full max-w-md flex-shrink-0">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">ZuraAI</h1>
        </div>

        {/* Main Card */}
        <div className="bg-[var(--theme-surface)] rounded-2xl border border-[var(--theme-border)] overflow-hidden shadow-xl">
          {appInfo ? (
            <div className="p-5">
              {/* App Version Section */}
              <SectionTitle>Application</SectionTitle>
              <div className="space-y-1">
                <InfoRow 
                  label="Version" 
                  value={appInfo.appVersion} 
                  highlight 
                />
                <InfoRow 
                  label="Build Type" 
                  value={appInfo.isPackaged ? 'Production' : 'Development'} 
                />
                <InfoRow 
                  label="Commit" 
                  value={appInfo.commitHash.substring(0, 9)} 
                />
                <InfoRow 
                  label="Build Date" 
                  value={`${appInfo.commitDate} ${getRelativeTime(appInfo.commitDate)}`} 
                />
              </div>

              {/* Runtime Section */}
              <SectionTitle>Runtime Environment</SectionTitle>
              <div className="space-y-1">
                <InfoRow label="Electron" value={appInfo.electronVersion} />
                <InfoRow label="Chromium" value={appInfo.chromiumVersion} />
                <InfoRow label="Node.js" value={appInfo.nodeVersion} />
                <InfoRow label="V8 Engine" value={appInfo.v8Version} />
              </div>

              {/* System Section */}
              <SectionTitle>System</SectionTitle>
              <div className="space-y-1">
                <InfoRow label="Operating System" value={appInfo.osVersion} highlight />
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--theme-surface-hover)] mb-3">
                <svg 
                  className="w-5 h-5 text-[var(--theme-text-secondary)] animate-spin" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
              <p className="text-[0.9rem] text-[var(--theme-text-secondary)]">Loading app details...</p>
            </div>
          )}

          </div>

        {/* Copyright */}
        <p className="text-[0.7rem] text-[var(--theme-text-secondary)] text-center mt-6 opacity-60">
          © 2026 ZuraAI. All rights reserved.
        </p>
      </div>
    </div>
  )
}
