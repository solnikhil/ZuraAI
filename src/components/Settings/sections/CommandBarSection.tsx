import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Command, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '../../../contexts/SettingsContext'
import type { CommandCenterAppDiagnostics, CommandCenterWindowsSearchDiagnostics } from '@/electron/types'
import { isWindowsRuntime } from '../../../utils/platform'

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function SettingsSelect({
  value,
  onValueChange,
  options,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  'aria-label'?: string
}): React.ReactElement {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-[180px]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="zura-menu-surface">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function formatTimestamp(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return 'Never'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return 'Unknown'
  }
}

function sourceCountsLabel(counts?: Record<string, number>): string {
  if (!counts || Object.keys(counts).length === 0) return 'No sources reported'
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, count]) => `${source}: ${count}`)
    .join(' · ')
}

export interface CommandBarSectionProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
}

export function CommandBarSection({
  settings,
  onChange,
}: CommandBarSectionProps): React.ReactElement {
  const isWindows = useMemo(() => isWindowsRuntime(), [])
  const commandBar = settings.commandBar
  const size = commandBar.size ?? 'medium'
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)
  const overlayOpacity = clampNumber(commandBar.overlayOpacity, 0, 80)

  const [appDiagnostics, setAppDiagnostics] = useState<CommandCenterAppDiagnostics | undefined>()
  const [windowsSearchDiagnostics, setWindowsSearchDiagnostics] = useState<
    CommandCenterWindowsSearchDiagnostics | undefined
  >()
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [indexedAppCount, setIndexedAppCount] = useState<number | null>(null)

  const updateCommandBar = (changes: Partial<Settings['commandBar']>) => {
    onChange({
      commandBar: {
        ...settings.commandBar,
        ...changes,
      },
    })
  }

  const loadStatus = useCallback(async () => {
    if (!isWindows || !window.commandCenter?.getIndex) {
      setAppDiagnostics(undefined)
      setWindowsSearchDiagnostics(undefined)
      setIndexedAppCount(null)
      return
    }
    setIsLoadingStatus(true)
    try {
      const [index, native] = await Promise.all([
        window.commandCenter.getIndex(''),
        window.commandCenter.searchNativeIndex?.('zura-index-probe').catch(() => null) ??
          Promise.resolve(null),
      ])
      setAppDiagnostics(index.diagnostics?.apps)
      setWindowsSearchDiagnostics(native?.diagnostics ?? index.diagnostics?.windowsSearch)
      setIndexedAppCount(Array.isArray(index.apps) ? index.apps.length : null)
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to load Command Center index status.'
      )
    } finally {
      setIsLoadingStatus(false)
    }
  }, [isWindows])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!statusMessage || statusMessage.startsWith('Reindexing')) return
    const timeoutId = window.setTimeout(() => setStatusMessage(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  const reindexApps = async () => {
    if (!isWindows || !window.commandCenter?.refreshAppIndex || isReindexing) return
    setIsReindexing(true)
    setStatusMessage('Reindexing apps and clearing icon cache…')
    try {
      // Ensure overlay/runtime is enabled so main will run a full refresh.
      await window.commandCenter.setExtensionEnabled?.(true)
      const result = await window.commandCenter.refreshAppIndex()
      setAppDiagnostics(result)
      const total = result?.sourceCounts
        ? Object.values(result.sourceCounts).reduce((sum, n) => sum + (n || 0), 0)
        : undefined
      if (total != null) setIndexedAppCount(total)
      await loadStatus()
      if (result?.ok) {
        setStatusMessage(
          result.refreshDurationMs != null
            ? `App index refreshed in ${result.refreshDurationMs}ms.`
            : 'App index refreshed.'
        )
      } else {
        setStatusMessage(
          result?.error
            ? `Reindex finished with warnings: ${result.error}`
            : 'Reindex finished with warnings.'
        )
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to reindex apps.')
    } finally {
      setIsReindexing(false)
    }
  }

  const openCommandCenter = async () => {
    if (!window.commandCenter) return
    try {
      await window.commandCenter.setExtensionEnabled?.(true)
      await window.commandCenter.show?.()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to open Command Center.')
    }
  }

  return (
    <div className="settings-section-layout settings-section-layout--wide">
      <div className="page-header">
        <h2 className="page-title">Command Bar</h2>
        <div className="page-subtitle">
          Manage Command Center app search, reindex installed apps, and tune the in-app command
          palette.
        </div>
      </div>

      <h3 className="appearance-group-heading">Command Center index</h3>
      <Card className="settings-list-card">
        {!isWindows ? (
          <div className="settings-list-row settings-list-row--stacked">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Windows only</h3>
              <div className="settings-list-row__description">
                Command Center app indexing and desktop search run only on Windows.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">App index status</h3>
                <div className="settings-list-row__description">
                  {isLoadingStatus
                    ? 'Loading…'
                    : appDiagnostics?.ok === false
                      ? `Incomplete or failed${appDiagnostics.error ? `: ${appDiagnostics.error}` : ''}`
                      : appDiagnostics?.stale
                        ? `Stale${appDiagnostics.error ? `: ${appDiagnostics.error}` : ''}`
                        : 'Healthy'}
                </div>
              </div>
              <div className="settings-list-row__control">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadStatus()}
                  disabled={isLoadingStatus || isReindexing}
                  aria-label="Refresh app index status"
                >
                  {isLoadingStatus ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  Status
                </Button>
              </div>
            </div>

            <div className="settings-list-row settings-list-row--stacked">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Details</h3>
                <div className="settings-list-row__description">
                  Apps indexed: {indexedAppCount ?? '—'}
                  <br />
                  Sources: {sourceCountsLabel(appDiagnostics?.sourceCounts)}
                  <br />
                  Last refresh: {formatTimestamp(appDiagnostics?.lastRefreshAt)}
                  {appDiagnostics?.refreshDurationMs != null
                    ? ` · ${appDiagnostics.refreshDurationMs}ms`
                    : ''}
                </div>
              </div>
            </div>

            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Reindex apps</h3>
                <div className="settings-list-row__description">
                  Rescan Start Menu / Desktop shortcuts and Windows Start apps, then clear cached
                  icons so missing icons can reload. Use this if apps disappear or show blank
                  icons.
                </div>
              </div>
              <div className="settings-list-row__control">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void reindexApps()}
                  disabled={isReindexing || !window.commandCenter?.refreshAppIndex}
                  aria-label="Reindex Command Center apps"
                >
                  {isReindexing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  {isReindexing ? 'Reindexing…' : 'Reindex apps'}
                </Button>
              </div>
            </div>

            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Open Command Center</h3>
                <div className="settings-list-row__description">
                  Ctrl+Shift+Space (fallback Ctrl+Alt+Space). Opens the desktop overlay to verify
                  search results after reindexing.
                </div>
              </div>
              <div className="settings-list-row__control">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void openCommandCenter()}
                  aria-label="Open Command Center overlay"
                >
                  <Command size={14} />
                  Open
                </Button>
              </div>
            </div>

            <div className="settings-list-row settings-list-row--stacked">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Windows file search</h3>
                <div className="settings-list-row__description">
                  {windowsSearchDiagnostics == null
                    ? 'Status unknown until the index is loaded.'
                    : windowsSearchDiagnostics.ok
                      ? 'Available (SystemIndex / Windows Search).'
                      : `Unavailable${
                          windowsSearchDiagnostics.error
                            ? `: ${windowsSearchDiagnostics.error}`
                            : ''
                        }. Enable the Windows Search (WSearch) service if you need file results.`}
                </div>
              </div>
            </div>

            {statusMessage ? (
              <div className="settings-list-row settings-list-row--stacked" role="status" aria-live="polite">
                <div className="settings-list-row__meta">
                  <div className="settings-list-row__description">{statusMessage}</div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <h3 className="appearance-group-heading">Overlay chats</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Save overlay chats</h3>
            <div className="settings-list-row__description">
              Store Command Center AI chats in normal chat history immediately. When off, they stay
              temporary until opened in Chat.
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={settings.commandCenterChatPersistence === 'always-save'}
              onCheckedChange={(checked) =>
                onChange({ commandCenterChatPersistence: checked ? 'always-save' : 'temporary' })
              }
              aria-label="Save Command Center overlay chats"
            />
          </div>
        </div>
      </Card>

      <h3 className="appearance-group-heading">In-app command palette</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Recent commands</h3>
            <div className="settings-list-row__description">
              Show recently executed commands at the top of the palette
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={commandBar.showRecents}
              onCheckedChange={(checked) => updateCommandBar({ showRecents: checked })}
              aria-label="Show recent commands in command palette"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Max recents</h3>
            <div className="settings-list-row__description">How many recent commands to show</div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={String(maxRecents)}
              onValueChange={(value) => updateCommandBar({ maxRecents: Number(value) })}
              options={[0, 1, 2, 3].map((count) => ({
                value: String(count),
                label: String(count),
              }))}
              disabled={!commandBar.showRecents}
              aria-label="Max recent commands in command palette"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Tab autocomplete</h3>
            <div className="settings-list-row__description">
              Press Tab to complete the highlighted command
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={commandBar.enableTabAutocomplete}
              onCheckedChange={(checked) => updateCommandBar({ enableTabAutocomplete: checked })}
              aria-label="Enable tab autocomplete in command palette"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Max results</h3>
            <div className="settings-list-row__description">
              Maximum number of suggestions shown in the results list
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={String(maxSuggestions)}
              onValueChange={(value) => updateCommandBar({ maxSuggestions: Number(value) })}
              options={[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => ({
                value: String(count),
                label: String(count),
              }))}
              aria-label="Max results in command palette"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Overlay opacity</h3>
            <div className="settings-list-row__description">
              Controls how much the background is dimmed
            </div>
          </div>
          <div className="settings-list-row__control">
            <input
              type="range"
              min={0}
              max={80}
              value={overlayOpacity}
              onChange={(e) => updateCommandBar({ overlayOpacity: Number(e.target.value) })}
              aria-label="Command palette overlay opacity"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Palette width</h3>
            <div className="settings-list-row__description">
              Controls the maximum width of the palette
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={commandBar.paletteWidth ?? 'default'}
              onValueChange={(value) =>
                updateCommandBar({ paletteWidth: value as 'narrow' | 'default' | 'wide' })
              }
              options={[
                { value: 'narrow', label: 'Narrow (440px)' },
                { value: 'default', label: 'Default (560px)' },
                { value: 'wide', label: 'Wide (680px)' },
              ]}
              aria-label="Command palette width"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Vertical position</h3>
            <div className="settings-list-row__description">
              Controls the vertical placement of the palette
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={commandBar.palettePosition ?? 'center'}
              onValueChange={(value) =>
                updateCommandBar({ palettePosition: value as 'top' | 'center' | 'lower' })
              }
              options={[
                { value: 'top', label: 'Top (12%)' },
                { value: 'center', label: 'Center (20%)' },
                { value: 'lower', label: 'Lower (30%)' },
              ]}
              aria-label="Command palette vertical position"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">UI size</h3>
            <div className="settings-list-row__description">
              Controls the overall density and text size of the command palette input
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={size}
              onValueChange={(value) =>
                updateCommandBar({ size: value as 'small' | 'medium' | 'large' })
              }
              options={[
                { value: 'small', label: 'Short' },
                { value: 'medium', label: 'Normal (current)' },
                { value: 'large', label: 'Larger' },
              ]}
              aria-label="Command palette UI size"
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
