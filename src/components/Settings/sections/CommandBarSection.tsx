import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Command, Loader2, RotateCcw } from 'lucide-react'

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
      <SelectTrigger
        className={['min-w-[160px] justify-between gap-3', disabled ? 'opacity-50' : ''].join(' ')}
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="settings-menu-surface">
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
  const isDesktopIndexSupported = useMemo(() => isWindowsRuntime() || isMacOSRuntime(), [])
  const commandBar = settings.commandBar
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)

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
  return (
    <div className="settings-section-layout settings-section-layout--wide command-bar-settings">
      <div className="page-header command-bar-settings__header">
        <div className="command-bar-settings__intro">
          <h2 className="page-title">Command Bar</h2>
          <div className="page-subtitle">
            Tune command search, overlay chat history, and keep the desktop app index healthy.
          </div>
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
      </div>

      <h3 className="appearance-group-heading">Search behavior</h3>
      <Card className="settings-list-card">
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
        <SettingRow label="Save overlay chats" description="Keep overlay chats in normal history">
          <Switch
            checked={settings.commandCenterChatPersistence === 'always-save'}
            onCheckedChange={(checked) =>
              onChange({ commandCenterChatPersistence: checked ? 'always-save' : 'temporary' })
            }
            aria-label="Save Command Center overlay chats"
          />
        </SettingRow>
      </Card>

      <h3 className="appearance-group-heading">App index health</h3>
      {!isDesktopIndexSupported ? (
        <Card className="settings-list-card">
          <SettingRow
            label="Desktop indexing unavailable"
            description="Command Center app indexing is available on Windows and macOS."
          />
        </Card>
      ) : (
        <Card className="settings-list-card command-bar-health-card">
          <div className="command-bar-health-card__toolbar">
            <span className={`command-bar-status command-bar-status--${indexState}`}>
              {indexState === 'healthy' ? <CheckCircle2 size={14} /> : <Activity size={14} />}
              {indexStateLabel}
            </span>
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
          <SettingRow
            label="Indexed apps"
            description={sourceCountsLabel(appDiagnostics?.sourceCounts)}
          >
            <span className="command-bar-health-value">{indexedAppCount ?? '—'}</span>
          </SettingRow>
          <SettingRow
            label="Last refresh"
            description={
              appDiagnostics?.refreshDurationMs != null
                ? `Last cycle took ${appDiagnostics.refreshDurationMs}ms`
                : 'Timestamp of the most recent app index refresh'
            }
          >
            <span className="command-bar-health-value">
              {formatTimestamp(appDiagnostics?.lastRefreshAt)}
            </span>
          </SettingRow>
          <SettingRow
            label="Windows file search"
            description={
              windowsSearchDiagnostics == null
                ? 'Status unknown until the index is loaded.'
                : windowsSearchDiagnostics.ok
                  ? 'Available (SystemIndex / Windows Search).'
                  : `Unavailable${windowsSearchDiagnostics.error ? `: ${windowsSearchDiagnostics.error}` : ''}. Enable the Windows Search (WSearch) service if you need file results.`
            }
          />
          {appDiagnostics?.error ? (
            <SettingRow label="Index detail" description={appDiagnostics.error} />
          ) : null}
          <div className="settings-list-row command-bar-health-card__action-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Reindex installed apps</h3>
              <div className="settings-list-row__description">
                Rescan application sources and clear cached icons when results look incomplete.
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
          {statusMessage ? (
            <div className="command-bar-health-card__status" role="status" aria-live="polite">
              {statusMessage}
            </div>
          ) : null}
        </Card>
      )}
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
    <div className={`settings-list-row${children ? '' : ' settings-list-row--stacked'}`}>
      <div className="settings-list-row__meta">
        <h3 className="settings-list-row__label">{label}</h3>
        <div className="settings-list-row__description">{description}</div>
      </div>
      {children ? <div className="settings-list-row__control">{children}</div> : null}
    </div>
  )
}
