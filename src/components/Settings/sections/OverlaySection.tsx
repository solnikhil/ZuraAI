import React, { useEffect, useState } from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import type { OverlaySettings } from '../../../contexts/SettingsConfigContext'
import { ChevronLeft, PanelLeft, Activity } from '../../icons'

export interface OverlaySectionProps {
  overlay: OverlaySettings
  onChange: (changes: { overlay: OverlaySettings }) => void
}

function clampWidth(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(640, Math.max(320, Math.round(value)))
}

export function OverlaySection({
  overlay,
  onChange,
}: OverlaySectionProps): React.ReactElement {
  const [overlayState, setOverlayState] = useState<string>('Checking overlay runtime...')
  const [discordRpcStateText, setDiscordRpcStateText] = useState<string>('Checking Discord RPC...')
  const [extensionView, setExtensionView] = useState<'catalog' | 'overlay'>('catalog')

  useEffect(() => {
    if (!window.overlay?.getState) {
      setOverlayState('Overlay bridge unavailable in this environment.')
      return
    }

    void window.overlay
      .getState()
      .then((state) => {
        setOverlayState(
          state.shortcutRegistered
            ? `Global shortcut active: ${state.hotkey}`
            : `Global shortcut unavailable or unregistered: ${state.hotkey}`
        )
      })
      .catch(() => {
        setOverlayState('Unable to read Overlay runtime state.')
      })
  }, [overlay.hotkey, overlay.enabled])

  useEffect(() => {
    if (!window.discordRpc?.getState) {
      setDiscordRpcStateText('Discord RPC bridge unavailable.')
      return
    }

    void window.discordRpc
      .getState()
      .then((state) => {
        if (state.connected) {
          setDiscordRpcStateText('Connected to Discord.')
        } else {
          setDiscordRpcStateText(state.lastError ?? 'Connecting...')
        }
      })
      .catch(() => {
        setDiscordRpcStateText('Unable to read Discord RPC state.')
      })
  }, [])

  // Subscribe to live Discord RPC state changes
  useEffect(() => {
    if (!window.discordRpc?.onStateChange) return
    return window.discordRpc.onStateChange((state) => {
      if (state.connected) {
        setDiscordRpcStateText('Connected to Discord.')
      } else {
        setDiscordRpcStateText(state.lastError ?? 'Connecting...')
      }
    })
  }, [])

  const updateOverlay = (changes: Partial<OverlaySettings>) => {
    onChange({
      overlay: {
        ...overlay,
        ...changes,
      },
    })
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Extensions</h2>
        <div className="page-subtitle">
          Manage desktop add-ons like the Overlay, using a catalog-and-detail flow that can grow with more extensions.
        </div>
      </div>

      {extensionView === 'catalog' && (
        <Card className="settings-section-card provider-hub-base-card mt-4" style={{ background: '#212121' }}>
          <div className="mt-3 first:mt-0">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <span>Extensions</span>
              <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">2</span>
            </div>

            <div className="flex flex-col gap-3">
              <div
                onClick={() => setExtensionView('overlay')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setExtensionView('overlay')
                  }
                }}
                role="button"
                tabIndex={0}
                className="w-full rounded-xl border border-white/15 p-5 text-left transition hover:border-white/30"
                style={{ background: '#2c2c2c' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`skills-row__logo ${overlay.enabled ? 'skills-row__logo--enabled' : ''}`}
                      style={{ width: 36, height: 36, borderRadius: 10 }}
                    >
                      <PanelLeft size={16} />
                    </span>
                    <span className="truncate text-[15px] font-semibold text-foreground">
                      Overlay
                    </span>
                  </div>
                  <Switch
                    className="provider-hub-toggle"
                    checked={overlay.enabled}
                    onCheckedChange={(enabled) => updateOverlay({ enabled })}
                    aria-label="Toggle Overlay"
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
                      Compact desktop chat window that lives outside the main dashboard. Open it from the titlebar, command palette, or the global shortcut.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded border border-white/10 px-2 py-1">
                        {overlay.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <span className="rounded border border-white/10 px-2 py-1">
                        Startup: {overlay.launchOnStartup ? 'On' : 'Off'}
                      </span>
                      <span className="rounded border border-white/10 px-2 py-1">
                        Shortcut: {overlay.hotkey}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground sm:text-right">
                    Click to configure
                  </div>
                </div>
              </div>

              <div
                className="w-full rounded-xl border border-white/15 p-5 text-left"
                style={{ background: '#2c2c2c' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="skills-row__logo skills-row__logo--enabled"
                      style={{ width: 36, height: 36, borderRadius: 10 }}
                    >
                      <Activity size={16} />
                    </span>
                    <span className="truncate text-[15px] font-semibold text-foreground">
                      Discord RPC
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
                      Shows your ZuraAI activity in Discord via Rich Presence. Requires the Discord desktop app to be running.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded border border-white/10 px-2 py-1">
                        Always on
                      </span>
                      <span className="rounded border border-white/10 px-2 py-1">
                        {discordRpcStateText}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {extensionView === 'overlay' && (
        <Card className="settings-section-card provider-hub-base-card mt-4" style={{ background: '#212121' }}>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExtensionView('catalog')}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label="Back to extensions"
                >
                  <ChevronLeft size={16} />
                </button>
                <PanelLeft size={18} />
                <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
                  Overlay
                </span>
              </div>

              <Switch
                className="provider-hub-toggle"
                checked={overlay.enabled}
                onCheckedChange={(enabled) => updateOverlay({ enabled })}
                aria-label="Enable Overlay"
              />
            </div>

            <div className="border-t border-border pt-6 space-y-4">
              <DetailField
                label="Open on App Startup"
                description="Reopen the overlay automatically after app launch when the feature is enabled."
                control={
                  <div className="flex justify-end">
                    <Switch
                      className="provider-hub-toggle"
                      checked={overlay.launchOnStartup}
                      onCheckedChange={(launchOnStartup) => updateOverlay({ launchOnStartup })}
                      aria-label="Open Overlay on startup"
                      disabled={!overlay.enabled}
                    />
                  </div>
                }
              />

              <DetailField
                label="Global Shortcut"
                description="Default is CommandOrControl+Shift+/ (Ctrl+Shift+? on Windows, Cmd+Shift+? on macOS). Registration can fail if another app already owns the accelerator."
                control={
                  <div className="space-y-2 w-full">
                    <input
                      type="text"
                      className="settings-text-input"
                      value={overlay.hotkey}
                      onChange={(event) => updateOverlay({ hotkey: event.target.value })}
                      placeholder="CommandOrControl+Shift+/"
                      disabled={!overlay.enabled}
                    />
                    <div className="settings-inline-note" role="status" aria-live="polite">
                      {overlayState}
                    </div>
                  </div>
                }
              />

              <DetailField
                label="Compact Width"
                description="Width of the default collapsed overlay panel."
                control={
                  <div className="space-y-2 w-full">
                    <input
                      type="range"
                      min={320}
                      max={640}
                      step={10}
                      value={overlay.compactWidth}
                      onChange={(event) =>
                        updateOverlay({
                          compactWidth: clampWidth(Number(event.target.value), overlay.compactWidth),
                        })
                      }
                      disabled={!overlay.enabled}
                    />
                    <div className="settings-inline-note">{overlay.compactWidth}px</div>
                  </div>
                }
              />

              <DetailField
                label="Expanded Width"
                description="Width of the larger chat surface when the Overlay is expanded."
                control={
                  <div className="space-y-2 w-full">
                    <input
                      type="range"
                      min={320}
                      max={640}
                      step={10}
                      value={overlay.expandedWidth}
                      onChange={(event) =>
                        updateOverlay({
                          expandedWidth: Math.max(
                            overlay.compactWidth,
                            clampWidth(Number(event.target.value), overlay.expandedWidth)
                          ),
                        })
                      }
                      disabled={!overlay.enabled}
                    />
                    <div className="settings-inline-note">{overlay.expandedWidth}px</div>
                  </div>
                }
              />

              <DetailField
                label="Overlay Prompt Auto-Hide"
                description="Hide the Overlay prompt area after inactivity. Hover near the bottom or press any key to reveal it."
                control={
                  <div className="flex justify-end">
                    <Switch
                      className="provider-hub-toggle"
                      checked={overlay.promptAutoHideEnabled ?? false}
                      onCheckedChange={(promptAutoHideEnabled) => updateOverlay({ promptAutoHideEnabled })}
                      aria-label="Enable Overlay prompt auto-hide"
                      disabled={!overlay.enabled}
                    />
                  </div>
                }
              />

              <DetailField
                label="Overlay Prompt Auto-Hide Timeout"
                description={`Seconds of inactivity before the Overlay prompt hides (${overlay.promptAutoHideTimeout ?? 120}s).`}
                control={
                  <div className="space-y-2 w-full">
                    <input
                      type="range"
                      min={30}
                      max={600}
                      step={10}
                      value={overlay.promptAutoHideTimeout ?? 120}
                      onChange={(event) =>
                        updateOverlay({ promptAutoHideTimeout: Number(event.target.value) })
                      }
                      disabled={!overlay.enabled || !(overlay.promptAutoHideEnabled ?? false)}
                      aria-label="Overlay prompt auto-hide timeout"
                    />
                    <div className="settings-inline-note">{overlay.promptAutoHideTimeout ?? 120}s</div>
                  </div>
                }
              />

              <DetailField
                label="Overlay Anchor"
                description="Phase 1 locks overlay docking to the right side of the active display work area."
                control={<div className="settings-inline-note"><code>{overlay.anchor}</code></div>}
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

export default OverlaySection

function DetailField({
  label,
  description,
  control,
}: {
  label: string
  description: React.ReactNode
  control: React.ReactNode
}): React.ReactElement {
  return (
    <div className="settings-list-row settings-list-row--field provider-hub-detail-field">
      <div className="settings-list-row__meta">
        <div className="settings-list-row__label">{label}</div>
        <div className="settings-list-row__description">{description}</div>
      </div>
      <div className="settings-list-row__control settings-list-row__control--stretch provider-hub-detail-field__control">
        {control}
      </div>
    </div>
  )
}
