import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Clock, Command, Loader2, RotateCcw, Search } from 'lucide-react'

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
import type {
  CommandCenterAppDiagnostics,
  CommandCenterWindowsSearchDiagnostics,
} from '@/electron/types'
import { isMacOSRuntime, isWindowsRuntime } from '../../../utils/platform'

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

const PREVIEW_RESULTS = [
  ['Open settings', 'Settings'],
  ['Start a new chat', 'Chat'],
  ['Search installed apps', 'Apps'],
  ['Browse Zura Store', 'Extensions'],
  ['Open downloads', 'System'],
] as const

export function CommandBarSection({
  settings,
  onChange,
}: CommandBarSectionProps): React.ReactElement {
  const isWindows = useMemo(() => isWindowsRuntime(), [])
  const isDesktopIndexSupported = useMemo(() => isWindowsRuntime() || isMacOSRuntime(), [])
  const commandBar = settings.commandBar
  const size = commandBar.size ?? 'medium'
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)
  const overlayOpacity = clampNumber(commandBar.overlayOpacity, 0, 80)

  const [appDiagnostics, setAppDiagnostics] = useState<CommandCenterAppDiagnostics>()
  const [windowsSearchDiagnostics, setWindowsSearchDiagnostics] =
    useState<CommandCenterWindowsSearchDiagnostics>()
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [indexedAppCount, setIndexedAppCount] = useState<number | null>(null)

  const updateCommandBar = (changes: Partial<Settings['commandBar']>) => {
    onChange({ commandBar: { ...settings.commandBar, ...changes } })
  }

  const loadStatus = useCallback(async () => {
    if (!isDesktopIndexSupported || !window.commandCenter?.getIndex) {
      setAppDiagnostics(undefined)
      setWindowsSearchDiagnostics(undefined)
      setIndexedAppCount(null)
      return
    }
    setIsLoadingStatus(true)
    try {
      const [index, native] = await Promise.all([
        window.commandCenter.getIndex(''),
        (isWindows
          ? window.commandCenter.searchNativeIndex?.('zura-index-probe').catch(() => null)
          : null) ?? Promise.resolve(null),
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
  }, [isDesktopIndexSupported, isWindows])

  useEffect(() => void loadStatus(), [loadStatus])

  useEffect(() => {
    if (!statusMessage || statusMessage.startsWith('Reindexing')) return
    const timeoutId = window.setTimeout(() => setStatusMessage(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  const reindexApps = async () => {
    if (!isDesktopIndexSupported || !window.commandCenter?.refreshAppIndex || isReindexing) return
    setIsReindexing(true)
    setStatusMessage('Reindexing apps and clearing icon cache…')
    try {
      await window.commandCenter.setExtensionEnabled?.(true)
      const result = await window.commandCenter.refreshAppIndex()
      setAppDiagnostics(result)
      const total = result?.sourceCounts
        ? Object.values(result.sourceCounts).reduce((sum, count) => sum + (count || 0), 0)
        : undefined
      if (total != null) setIndexedAppCount(total)
      await loadStatus()
      setStatusMessage(
        result?.ok
          ? result.refreshDurationMs != null
            ? `App index refreshed in ${result.refreshDurationMs}ms.`
            : 'App index refreshed.'
          : result?.error
            ? `Reindex finished with warnings: ${result.error}`
            : 'Reindex finished with warnings.'
      )
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

  const indexState = isLoadingStatus
    ? 'checking'
    : appDiagnostics?.ok === false
      ? 'issue'
      : appDiagnostics?.stale
        ? 'stale'
        : appDiagnostics
          ? 'healthy'
          : 'unknown'
  const indexStateLabel = {
    checking: 'Checking index',
    issue: 'Index needs attention',
    stale: 'Index is stale',
    healthy: 'Index healthy',
    unknown: 'Status unavailable',
  }[indexState]
  const previewWidth = commandBar.paletteWidth ?? 'default'
  const previewPosition = commandBar.palettePosition ?? 'center'

  return (
    <div className="settings-section-layout settings-section-layout--wide command-bar-settings">
      <header className="command-bar-settings__header">
        <div className="command-bar-settings__intro">
          <div className="command-bar-settings__eyebrow">Workspace controls</div>
          <h2 className="page-title">Command Bar</h2>
          <p className="page-subtitle">
            Shape how commands surface, how much context you see, and how the desktop index stays
            ready.
          </p>
        </div>
        <div className="command-bar-settings__header-actions">
          <span className={`command-bar-status command-bar-status--${indexState}`}>
            {indexState === 'healthy' ? <CheckCircle2 size={14} /> : <Activity size={14} />}
            {indexStateLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openCommandCenter()}
            aria-label="Open Command Center overlay"
          >
            <Command size={14} /> Open Command Center
          </Button>
        </div>
      </header>

      <section className="command-bar-preview-section" aria-labelledby="command-bar-preview-title">
        <div className="command-bar-section-heading">
          <div>
            <span className="command-bar-section-heading__kicker">Live workspace</span>
            <h3 id="command-bar-preview-title">Preview your command flow</h3>
          </div>
          <span className="command-bar-section-heading__note">Updates as you customize</span>
        </div>
        <div
          className={`command-bar-preview command-bar-preview--${previewPosition}`}
          style={{ '--command-bar-preview-dim': overlayOpacity / 100 } as React.CSSProperties}
          data-testid="command-bar-preview"
          data-width={previewWidth}
          data-position={previewPosition}
          data-size={size}
          data-opacity={overlayOpacity}
          data-results={maxSuggestions}
          data-recents={commandBar.showRecents ? maxRecents : 0}
        >
          <div className="command-bar-preview__workspace" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="command-bar-preview__veil" />
          <div
            className={`command-bar-preview__palette command-bar-preview__palette--${previewWidth} command-bar-preview__palette--${size}`}
          >
            <div className="command-bar-preview__search">
              <Search size={16} />
              <span>Search apps, chats and actions</span>
              <kbd>⌘ K</kbd>
            </div>
            {commandBar.showRecents && maxRecents > 0 ? (
              <div className="command-bar-preview__label">
                <Clock size={11} /> Recent · {maxRecents}
              </div>
            ) : null}
            <div className="command-bar-preview__results">
              {PREVIEW_RESULTS.slice(0, Math.min(maxSuggestions, 5)).map(([title, hint], index) => (
                <div key={title} className={index === 0 ? 'is-active' : ''}>
                  <span className="command-bar-preview__result-icon">
                    <Command size={13} />
                  </span>
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="command-bar-settings__grid">
        <section
          className="command-bar-settings__panel"
          aria-labelledby="command-bar-appearance-title"
        >
          <div className="command-bar-panel-heading">
            <Activity size={16} />
            <div>
              <h3 id="command-bar-appearance-title">Appearance</h3>
              <p>Control the palette’s footprint and placement.</p>
            </div>
          </div>
          <Card className="settings-list-card command-bar-control-card">
            <SettingRow label="Overlay opacity" description="How much the workspace is dimmed">
              <input
                type="range"
                min={0}
                max={80}
                value={overlayOpacity}
                onChange={(event) =>
                  updateCommandBar({ overlayOpacity: Number(event.target.value) })
                }
                aria-label="Command palette overlay opacity"
              />
              <output className="command-bar-range-value">{overlayOpacity}%</output>
            </SettingRow>
            <SettingRow label="Palette width" description="Set the maximum palette width">
              <SettingsSelect
                value={previewWidth}
                onValueChange={(value) =>
                  updateCommandBar({ paletteWidth: value as 'narrow' | 'default' | 'wide' })
                }
                options={[
                  { value: 'narrow', label: 'Narrow · 440px' },
                  { value: 'default', label: 'Default · 560px' },
                  { value: 'wide', label: 'Wide · 680px' },
                ]}
                aria-label="Command palette width"
              />
            </SettingRow>
            <SettingRow label="Vertical position" description="Choose where the palette enters">
              <SettingsSelect
                value={previewPosition}
                onValueChange={(value) =>
                  updateCommandBar({ palettePosition: value as 'top' | 'center' | 'lower' })
                }
                options={[
                  { value: 'top', label: 'Top · 12%' },
                  { value: 'center', label: 'Center · 20%' },
                  { value: 'lower', label: 'Lower · 30%' },
                ]}
                aria-label="Command palette vertical position"
              />
            </SettingRow>
            <SettingRow label="UI size" description="Adjust height and information density">
              <SettingsSelect
                value={size}
                onValueChange={(value) =>
                  updateCommandBar({ size: value as 'small' | 'medium' | 'large' })
                }
                options={[
                  { value: 'small', label: 'Compact' },
                  { value: 'medium', label: 'Comfortable' },
                  { value: 'large', label: 'Spacious' },
                ]}
                aria-label="Command palette UI size"
              />
            </SettingRow>
          </Card>
        </section>

        <section
          className="command-bar-settings__panel"
          aria-labelledby="command-bar-behavior-title"
        >
          <div className="command-bar-panel-heading">
            <Command size={16} />
            <div>
              <h3 id="command-bar-behavior-title">Search behavior</h3>
              <p>Tune speed, context, and completion.</p>
            </div>
          </div>
          <Card className="settings-list-card command-bar-control-card">
            <SettingRow label="Recent commands" description="Surface your latest actions first">
              <Switch
                checked={commandBar.showRecents}
                onCheckedChange={(checked) => updateCommandBar({ showRecents: checked })}
                aria-label="Show recent commands in command palette"
              />
            </SettingRow>
            <SettingRow label="Max recents" description="Number of recent actions to show">
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
            </SettingRow>
            <SettingRow label="Tab autocomplete" description="Complete the highlighted command">
              <Switch
                checked={commandBar.enableTabAutocomplete}
                onCheckedChange={(checked) => updateCommandBar({ enableTabAutocomplete: checked })}
                aria-label="Enable tab autocomplete in command palette"
              />
            </SettingRow>
            <SettingRow label="Max results" description="Cap suggestions displayed per search">
              <SettingsSelect
                value={String(maxSuggestions)}
                onValueChange={(value) => updateCommandBar({ maxSuggestions: Number(value) })}
                options={[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => ({
                  value: String(count),
                  label: String(count),
                }))}
                aria-label="Max results in command palette"
              />
            </SettingRow>
            <SettingRow
              label="Save overlay chats"
              description="Keep overlay chats in normal history"
            >
              <Switch
                checked={settings.commandCenterChatPersistence === 'always-save'}
                onCheckedChange={(checked) =>
                  onChange({ commandCenterChatPersistence: checked ? 'always-save' : 'temporary' })
                }
                aria-label="Save Command Center overlay chats"
              />
            </SettingRow>
          </Card>
        </section>
      </div>

      <section className="command-bar-index" aria-labelledby="command-bar-index-title">
        <div className="command-bar-section-heading">
          <div>
            <span className="command-bar-section-heading__kicker">Desktop readiness</span>
            <h3 id="command-bar-index-title">App index health</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadStatus()}
            disabled={isLoadingStatus || isReindexing}
            aria-label="Refresh app index status"
          >
            {isLoadingStatus ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}{' '}
            Refresh status
          </Button>
        </div>
        {!isDesktopIndexSupported ? (
          <Card className="settings-list-card">
            <SettingRow
              label="Desktop indexing unavailable"
              description="Command Center app indexing is available on Windows and macOS."
            />
          </Card>
        ) : (
          <Card className="settings-list-card command-bar-health-card">
            <div className="command-bar-health-card__summary">
              <div>
                <span>Indexed apps</span>
                <strong>{indexedAppCount ?? '—'}</strong>
              </div>
              <div>
                <span>Index state</span>
                <strong>{indexStateLabel}</strong>
              </div>
              <div>
                <span>Last refresh</span>
                <strong>{formatTimestamp(appDiagnostics?.lastRefreshAt)}</strong>
              </div>
            </div>
            <div className="command-bar-health-card__details">
              <div>
                <span>Sources</span>
                <p>{sourceCountsLabel(appDiagnostics?.sourceCounts)}</p>
              </div>
              <div>
                <span>Windows file search</span>
                <p>
                  {windowsSearchDiagnostics == null
                    ? 'Status unknown until the index is loaded.'
                    : windowsSearchDiagnostics.ok
                      ? 'Available (SystemIndex / Windows Search).'
                      : `Unavailable${windowsSearchDiagnostics.error ? `: ${windowsSearchDiagnostics.error}` : ''}. Enable the Windows Search (WSearch) service if you need file results.`}
                </p>
              </div>
              {appDiagnostics?.error ? (
                <div>
                  <span>Index detail</span>
                  <p>{appDiagnostics.error}</p>
                </div>
              ) : null}
            </div>
            <div className="command-bar-health-card__action">
              <div>
                <strong>Reindex installed apps</strong>
                <p>
                  Rescan application sources and clear cached icons when results look incomplete.
                </p>
              </div>
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
            {statusMessage ? (
              <div className="command-bar-health-card__status" role="status" aria-live="polite">
                {statusMessage}
              </div>
            ) : null}
          </Card>
        )}
      </section>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="settings-list-row">
      <div className="settings-list-row__meta">
        <h3 className="settings-list-row__label">{label}</h3>
        <div className="settings-list-row__description">{description}</div>
      </div>
      {children ? <div className="settings-list-row__control">{children}</div> : null}
    </div>
  )
}
