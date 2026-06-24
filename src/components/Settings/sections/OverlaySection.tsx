import React, { useEffect, useState } from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import type { OverlaySettings } from '../../../contexts/SettingsConfigContext'

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
        <h2 className="page-title">Overlay</h2>
        <div className="page-subtitle">
          Configure the Siri/Spotlight-style desktop chat surface that docks to the top-right corner.
        </div>
      </div>

      <Card className="settings-section-card provider-hub-base-card mt-4">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">Enable Overlay</h3>
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
              description="The overlay docks to the top-right corner of the active display work area and grows downward from a compact pill into a conversation card."
              control={<div className="settings-inline-note"><code>top-right</code></div>}
            />
          </div>
        </div>
      </Card>
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
