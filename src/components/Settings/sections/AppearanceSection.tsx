/**
 * AppearanceSection component for Settings
 * Continuous vertical layout for all appearance settings.
 *
 */

import React, { useEffect, useMemo, useState } from 'react'

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
  ChatSelectedOverlayStyle,
  RemindersActionStyle,
  RemindersBadgeStyle,
  RemindersCardStyle,
} from '../../../contexts/SettingsUIContext'
import { defaultSettingsUI } from '../../../contexts/SettingsUIContext'
import {
  ASSISTANT_PERSONALITIES,
  normalizeAssistantPersonalityId,
  type AssistantPersonalityId,
} from '../../../prompts/assistantPersonalities'
import {
  getThemeById,
  getDefaultTheme,
  getThemesByCategory,
} from '../../../themes/themeRegistry'
import {
  getAvailableTitleModelOptions,
  getProviderDefinition,
} from '../../../providers'

import { ProviderLogo } from '@/components/shared'
import { Zap, Settings as SettingsIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

function normalizeHexColor(color: string): string {
  if (!color) return ''
  const trimmed = color.trim()
  if (isValidHexColor(trimmed)) return trimmed
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed}`
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return trimmed
}

const chatBubblePresets = [
  {
    id: 'solid',
    label: 'Solid Accent',
    description: 'Filled bubble with theme message color',
    previewStyle: {
      background: 'var(--theme-user-message-bg)',
      border: '1px solid var(--theme-border-subtle)',
      boxShadow: 'none',
      color: 'var(--theme-user-message-text)',
    },
  },
  {
    id: 'glass',
    label: 'Soft Glass',
    description: 'Translucent bubble with blur and border',
    previewStyle: {
      background: 'rgba(148, 163, 184, 0.18)',
      border: '1px solid rgba(255, 255, 255, 0.22)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    },
  },
  {
    id: 'outline',
    label: 'Outline Minimal',
    description: 'Transparent bubble with accent outline',
    previewStyle: {
      background: 'transparent',
      border: '1px solid var(--theme-accent-muted)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
    },
  },
  {
    id: 'gradient',
    label: 'Gradient Pop',
    description: 'Accent gradient bubble with stronger contrast',
    previewStyle: {
      background:
        'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 82%, transparent) 0%, color-mix(in srgb, var(--theme-accent-secondary) 78%, transparent) 100%)',
      border: '1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      boxShadow: 'none',
      color: 'var(--theme-text-inverse)',
    },
  },
  {
    id: 'elevated',
    label: 'Elevated Card',
    description: 'Surface card with stronger depth and border',
    previewStyle: {
      background: 'var(--theme-surface)',
      border: '1px solid var(--theme-border)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
    },
  },
  {
    id: 'terminal',
    label: 'Terminal Mono',
    description: 'Dashed mono bubble with CLI-like style',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-background) 76%, black 24%)',
      border: '1px dashed var(--theme-border-hover)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.01em',
    },
  },
] as const

const chatSelectedOverlayPresets: Array<{
  id: ChatSelectedOverlayStyle
  label: string
  description: string
  previewStyle: React.CSSProperties
}> = [
  {
    id: 'linear',
    label: 'Linear Solid',
    description: 'Dense neutral surface with precise edge',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-active) 88%, black 12%)',
      border: '1px solid color-mix(in srgb, var(--theme-border-hover) 72%, transparent)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    },
  },
  {
    id: 'notion',
    label: 'Notion Soft',
    description: 'Calm, low-contrast solid selection',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-hover) 82%, transparent)',
      border: '1px solid transparent',
      boxShadow: 'none',
    },
  },
  {
    id: 'slack',
    label: 'Slack Tint',
    description: 'Solid accent-tinted selection for focus',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-accent) 16%, var(--theme-surface-active))',
      border: '1px solid color-mix(in srgb, var(--theme-accent) 28%, transparent)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
    },
  },
  {
    id: 'discord',
    label: 'Discord Solid',
    description: 'Chunky neutral fill with soft border',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-active) 92%, var(--theme-surface) 8%)',
      border: '1px solid color-mix(in srgb, var(--theme-border) 62%, transparent)',
      boxShadow: 'none',
    },
  },
  {
    id: 'github',
    label: 'GitHub Subtle',
    description: 'Clean card-like active row with restraint',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-active) 86%, transparent)',
      border: '1px solid color-mix(in srgb, var(--theme-border) 78%, transparent)',
      boxShadow: 'none',
    },
  },
]

const remindersCardOptions: Array<{ value: RemindersCardStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'outline', label: 'Outline' },
]

const remindersActionOptions: Array<{ value: RemindersActionStyle; label: string }> = [
  { value: 'pill', label: 'Pill' },
  { value: 'soft', label: 'Soft' },
  { value: 'minimal', label: 'Minimal' },
]

const remindersBadgeOptions: Array<{ value: RemindersBadgeStyle; label: string }> = [
  { value: 'soft', label: 'Soft' },
  { value: 'filled', label: 'Filled' },
  { value: 'outline', label: 'Outline' },
]

export interface AppearanceSectionProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
  initialCommandPaletteTab?: boolean
  onParamsConsumed?: () => void
}

export function AppearanceSection({
  settings,
  onChange,
  initialCommandPaletteTab,
  onParamsConsumed,
}: AppearanceSectionProps): React.ReactElement {
  const updateSettings = (changes: Partial<typeof settings>) => onChange(changes)
  const currentChatBubbleStyle = settings.chatBubbleStyle || 'solid'
  const currentChatSelectedOverlayStyle = settings.chatSelectedOverlayStyle || 'linear'
  const [accentInput, setAccentInput] = useState('')
  const [backgroundInput, setBackgroundInput] = useState('')
  const [foregroundInput, setForegroundInput] = useState('')

  // Consume the initialCommandPaletteTab param (no longer needed for tab switching but keep the callback)
  useEffect(() => {
    if (initialCommandPaletteTab) {
      onParamsConsumed?.()
    }
  }, [initialCommandPaletteTab, onParamsConsumed])

  // Helper to get modelSelector with defaults
  const getModelSelector = () => ({
    ...defaultSettingsUI.modelSelector!,
    ...settings.modelSelector,
  })
  const commandBar = settings.commandBar
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)
  const overlayOpacity = clampNumber(commandBar.overlayOpacity, 0, 80)
  const promptAutoHide = settings.promptAutoHide
  const promptTimeout = clampNumber(promptAutoHide.timeout, 30, 600)
  const remindersAppearance = {
    ...defaultSettingsUI.remindersAppearance!,
    ...settings.remindersAppearance,
  }

  const titleModelOptions: Array<{ value: string; label: string; provider: string }> =
    getAvailableTitleModelOptions(settings).map((option) => ({
      value: option.id,
      label: option.displayName,
      provider: option.provider,
    }))

  if (
    settings.titleModel &&
    !titleModelOptions.some((model) => model.value === settings.titleModel)
  ) {
    titleModelOptions.push({ value: settings.titleModel, label: settings.titleModel, provider: '' })
  }

  const selectedTitleModel = titleModelOptions.find((o) => o.value === settings.titleModel)

  const titleProviders = (() => {
    const seen = new Set<string>()
    const providers: Array<{ id: string; label: string }> = []
    for (const option of titleModelOptions) {
      if (option.provider && !seen.has(option.provider)) {
        seen.add(option.provider)
        providers.push({ id: option.provider, label: getProviderDefinition(option.provider).label })
      }
    }
    return providers
  })()

  const selectedProvider = selectedTitleModel?.provider || titleProviders[0]?.id || ''

  const updateCommandBar = (changes: Partial<typeof settings.commandBar>) => {
    updateSettings({
      commandBar: {
        ...settings.commandBar,
        ...changes,
      },
    })
  }

  const updatePromptAutoHide = (changes: Partial<typeof settings.promptAutoHide>) => {
    updateSettings({
      promptAutoHide: {
        ...settings.promptAutoHide,
        ...changes,
      },
    })
  }

  const updateRemindersAppearance = (changes: Partial<typeof remindersAppearance>) => {
    updateSettings({
      remindersAppearance: {
        ...remindersAppearance,
        ...changes,
      },
    })
  }

  const currentTheme = getThemeById(settings.activeTheme) || getDefaultTheme()
  const currentContrast = settings.themeContrast ?? 100
  const themeAccentColor = settings.themeAccent ?? currentTheme.baseColors.accent
  const themeBackgroundColor = settings.themeBackground ?? currentTheme.baseColors.background
  const themeForegroundColor = settings.themeForeground ?? currentTheme.baseColors.foreground

  useEffect(() => {
    setAccentInput(themeAccentColor)
    setBackgroundInput(themeBackgroundColor)
    setForegroundInput(themeForegroundColor)
  }, [themeAccentColor, themeBackgroundColor, themeForegroundColor])

  const allThemes = useMemo(() => getThemesByCategory('all'), [])
  const hasCustomThemeOverrides =
    settings.themeAccent !== undefined ||
    settings.themeBackground !== undefined ||
    settings.themeForeground !== undefined ||
    currentContrast !== 100

  const handleThemePresetChange = (themeId: string) => {
    const selectedTheme = getThemeById(themeId)
    if (selectedTheme) {
      updateSettings({
        activeTheme: themeId,
        theme: selectedTheme.isDark ? 'dark' : 'light',
        themeAccent: undefined,
        themeBackground: undefined,
        themeForeground: undefined,
        themeContrast: 100,
      })
    }
  }

  const commitThemeColor = (
    key: 'themeAccent' | 'themeBackground' | 'themeForeground',
    value: string,
    fallback: string
  ) => {
    const normalized = normalizeHexColor(value)
    if (!normalized) {
      updateSettings({ [key]: undefined } as Partial<Settings>)
      return fallback
    }

    if (!isValidHexColor(normalized)) {
      return fallback
    }

    updateSettings({ [key]: normalized } as Partial<Settings>)
    return normalized
  }

  const handleColorInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    commit: () => void
  ) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      commit()
    }
  }

  const resetThemeCustomization = () => {
    updateSettings({
      themeAccent: undefined,
      themeBackground: undefined,
      themeForeground: undefined,
      themeContrast: 100,
    })
  }

  const handleContrastChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = clampNumber(Number(e.target.value), 0, 100)
    updateSettings({ themeContrast: value })
  }

  return (
    <div
      className="settings-section-layout settings-section-layout--wide"
      style={{ width: '100%' }}
    >
      <div className="page-header">
        <h2 className="page-title">Appearance</h2>
        <div className="page-subtitle">Personalize themes and window presentation.</div>
      </div>

      <h3 className="appearance-group-heading">Theme</h3>
      <Card className="settings-list-card">
        <div className="theme-customization-panel">
          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Preset</h3>
              <div className="settings-list-row__description">
                Choose a base theme preset, then fine-tune colors below if needed
              </div>
            </div>
            <div className="settings-list-row__control">
              <div className="theme-control-group">
                <SettingsSelect
                  value={settings.activeTheme}
                  onValueChange={handleThemePresetChange}
                  options={allThemes.map((theme) => ({ value: theme.id, label: theme.name }))}
                  aria-label="Theme preset"
                />
                {hasCustomThemeOverrides && (
                  <button
                    type="button"
                    onClick={resetThemeCustomization}
                    className="theme-reset-button"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Accent</h3>
              <div className="settings-list-row__description">
                Primary accent color for highlights and buttons
              </div>
            </div>
            <div className="settings-list-row__control">
              <div className="theme-control-group">
              <input
                type="color"
                value={themeAccentColor}
                onChange={(event) => updateSettings({ themeAccent: event.target.value })}
                className="theme-color-picker"
                aria-label="Accent color"
              />
              <input
                type="text"
                value={accentInput}
                onChange={(event) => setAccentInput(normalizeHexColor(event.target.value))}
                onBlur={() => setAccentInput(commitThemeColor('themeAccent', accentInput, themeAccentColor))}
                onKeyDown={(event) =>
                  handleColorInputKeyDown(event, () =>
                    setAccentInput(commitThemeColor('themeAccent', accentInput, themeAccentColor))
                  )
                }
                placeholder={currentTheme.baseColors.accent}
                className="theme-color-input"
                aria-label="Accent color hex value"
              />
              </div>
            </div>
          </div>

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Background</h3>
              <div className="settings-list-row__description">
                Base background color for the interface
              </div>
            </div>
            <div className="settings-list-row__control">
              <div className="theme-control-group">
              <input
                type="color"
                value={themeBackgroundColor}
                onChange={(event) => updateSettings({ themeBackground: event.target.value })}
                className="theme-color-picker"
                aria-label="Background color"
              />
              <input
                type="text"
                value={backgroundInput}
                onChange={(event) => setBackgroundInput(normalizeHexColor(event.target.value))}
                onBlur={() =>
                  setBackgroundInput(
                    commitThemeColor('themeBackground', backgroundInput, themeBackgroundColor)
                  )
                }
                onKeyDown={(event) =>
                  handleColorInputKeyDown(event, () =>
                    setBackgroundInput(
                      commitThemeColor('themeBackground', backgroundInput, themeBackgroundColor)
                    )
                  )
                }
                placeholder={currentTheme.baseColors.background}
                className="theme-color-input"
                aria-label="Background color hex value"
              />
              </div>
            </div>
          </div>

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Foreground</h3>
              <div className="settings-list-row__description">
                Primary text and foreground element color
              </div>
            </div>
            <div className="settings-list-row__control">
              <div className="theme-control-group">
              <input
                type="color"
                value={themeForegroundColor}
                onChange={(event) => updateSettings({ themeForeground: event.target.value })}
                className="theme-color-picker"
                aria-label="Foreground color"
              />
              <input
                type="text"
                value={foregroundInput}
                onChange={(event) => setForegroundInput(normalizeHexColor(event.target.value))}
                onBlur={() =>
                  setForegroundInput(
                    commitThemeColor('themeForeground', foregroundInput, themeForegroundColor)
                  )
                }
                onKeyDown={(event) =>
                  handleColorInputKeyDown(event, () =>
                    setForegroundInput(
                      commitThemeColor('themeForeground', foregroundInput, themeForegroundColor)
                    )
                  )
                }
                placeholder={currentTheme.baseColors.foreground}
                className="theme-color-input"
                aria-label="Foreground color hex value"
              />
              </div>
            </div>
          </div>

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Contrast</h3>
              <div className="settings-list-row__description">
                Adjust theme contrast (lower = softer, higher = sharper)
              </div>
            </div>
            <div className="settings-list-row__control">
              <div className="theme-contrast-control">
              <input
                type="range"
                min={0}
                max={100}
                value={currentContrast}
                onChange={handleContrastChange}
                className="theme-contrast-slider"
                aria-label="Contrast slider"
              />
              <span className="theme-contrast-value">{currentContrast}%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="settings-list-card reminders-theme-card">
        <div className="settings-list-row settings-list-row--preview">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Reminders & Lookouts</h3>
            <div className="settings-list-row__description">
              Tune the Ask agent button, task card, and status badges used in the reminders view
            </div>
          </div>
          <div
            className="reminders-theme-preview"
            data-card-style={remindersAppearance.cardStyle}
            data-action-style={remindersAppearance.actionStyle}
            data-badge-style={remindersAppearance.badgeStyle}
            data-accent-tint={remindersAppearance.useAccentTint ? 'on' : 'off'}
            aria-label="Reminders and Lookouts theme preview"
          >
            <div className="reminders-theme-preview__header">
              <div>
                <div className="reminders-theme-preview__title">Reminders & Lookouts</div>
                <div className="reminders-theme-preview__subtitle">
                  Scheduled work and monitored pages.
                </div>
              </div>
              <button type="button" className="reminders-theme-preview__ask">
                Ask agent
              </button>
            </div>
            <div className="reminders-theme-preview__filters" aria-hidden="true">
              <span className="is-active">All <b>1</b></span>
              <span>Reminders <b>1</b></span>
              <span>Lookouts <b>0</b></span>
            </div>
            <div className="reminders-theme-preview__row">
              <span className="reminders-theme-preview__number">1</span>
              <div className="reminders-theme-preview__main">
                <strong>Random Reminder</strong>
                <div className="reminders-theme-preview__badges">
                  <span>Reminder</span>
                  <span className="is-active">Active</span>
                  <span>Every 30 min</span>
                </div>
              </div>
              <button type="button" className="reminders-theme-preview__logs">
                Logs
              </button>
              <button type="button" className="reminders-theme-preview__menu" aria-label="More actions">
                ...
              </button>
            </div>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Task card</h3>
            <div className="settings-list-row__description">
              Controls the surface treatment for reminder and lookout rows
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={remindersAppearance.cardStyle}
              onValueChange={(value) =>
                updateRemindersAppearance({ cardStyle: value as RemindersCardStyle })
              }
              options={remindersCardOptions}
              aria-label="Reminders task card style"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Ask agent button</h3>
            <div className="settings-list-row__description">
              Controls the header action used to start a reminder or lookout prompt
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={remindersAppearance.actionStyle}
              onValueChange={(value) =>
                updateRemindersAppearance({ actionStyle: value as RemindersActionStyle })
              }
              options={remindersActionOptions}
              aria-label="Reminders Ask agent button style"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Badges</h3>
            <div className="settings-list-row__description">
              Controls the style of type, status, repeat, and next-run badges
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={remindersAppearance.badgeStyle}
              onValueChange={(value) =>
                updateRemindersAppearance({ badgeStyle: value as RemindersBadgeStyle })
              }
              options={remindersBadgeOptions}
              aria-label="Reminders badge style"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Accent tint</h3>
            <div className="settings-list-row__description">
              Let active reminders use the theme accent in hover and status treatments
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={remindersAppearance.useAccentTint}
              onCheckedChange={(checked) => updateRemindersAppearance({ useAccentTint: checked })}
              aria-label="Use accent tint in Reminders and Lookouts"
            />
          </div>
        </div>
      </Card>

      <h3 className="appearance-group-heading">Command Palette</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Enable command palette</h3>
            <div className="settings-list-row__description">
              Show the floating command palette when activated via keyboard shortcut
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={commandBar.enabled}
              onCheckedChange={(checked) => updateCommandBar({ enabled: checked })}
              aria-label="Enable command palette"
            />
          </div>
        </div>

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
              options={[0, 1, 2, 3].map((count) => ({ value: String(count), label: String(count) }))}
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
      </Card>

      <h3 className="appearance-group-heading">Chat Bubbles</h3>
      <Card className="settings-section-card">
        <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
          Choose how your user messages are rendered in dashboard chat.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
          }}
        >
          {chatBubblePresets.map((preset) => {
            const isActive = currentChatBubbleStyle === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => updateSettings({ chatBubbleStyle: preset.id })}
                style={{
                  textAlign: 'left',
                  padding: '14px',
                  borderRadius: '12px',
                  border: isActive
                    ? '1px solid var(--theme-border-hover)'
                    : '1px solid var(--theme-border)',
                  background: isActive
                    ? 'var(--theme-surface-active)'
                    : 'var(--theme-surface-subtle)',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    padding: '9px 14px',
                    borderRadius: '18px 18px 6px 18px',
                    fontSize: '0.85rem',
                    marginBottom: '10px',
                    ...preset.previewStyle,
                  }}
                >
                  who are you
                </div>
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--theme-text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  {preset.label}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  {preset.description}
                </div>
              </button>
            )
          })}
        </div>

        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: '1px solid var(--theme-border-subtle)',
          }}
        >
          <h4
            style={{
              margin: '0 0 6px',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
            }}
          >
            Chat Selected Overlay
          </h4>
          <p
            style={{
              margin: '0 0 14px',
              fontSize: '0.82rem',
              color: 'var(--theme-text-muted)',
            }}
          >
            Choose the selected chat highlight style in the sidebar.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            {chatSelectedOverlayPresets.map((preset) => {
              const isActive = currentChatSelectedOverlayStyle === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => updateSettings({ chatSelectedOverlayStyle: preset.id })}
                  style={{
                    textAlign: 'left',
                    padding: '14px',
                    borderRadius: '12px',
                    border: isActive
                      ? '1px solid var(--theme-border-hover)'
                      : '1px solid var(--theme-border)',
                    background: isActive
                      ? 'var(--theme-surface-active)'
                      : 'var(--theme-surface-subtle)',
                    boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      height: 34,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                      marginBottom: 10,
                      ...preset.previewStyle,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--theme-text-primary)',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Opensource
                    </span>
                    <span
                      style={{
                        marginLeft: 8,
                        color: 'var(--theme-text-muted)',
                        fontSize: '0.85rem',
                        lineHeight: 1,
                      }}
                    >
                      ...
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: 'var(--theme-text-primary)',
                      marginBottom: '4px',
                    }}
                  >
                    {preset.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                    {preset.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: '1px solid var(--theme-border-subtle)',
          }}
        >
          <h4
            style={{
              margin: '0 0 6px',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
            }}
          >
            Empty State Placeholder
          </h4>
          <p
            style={{
              margin: '0 0 14px',
              fontSize: '0.82rem',
              color: 'var(--theme-text-muted)',
            }}
          >
            Choose the style of placeholder text shown in an empty chat.
          </p>
          <SettingsSelect
            value={settings.placeholderStyle || 'genz'}
            onValueChange={(value) =>
              updateSettings({ placeholderStyle: value as 'normal' | 'genz' })
            }
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'genz', label: 'Gen Z' },
            ]}
            aria-label="Empty state placeholder style"
          />
        </div>
      </Card>

      <h3 className="appearance-group-heading">Assistant</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Assistant personality</h3>
            <div className="settings-list-row__description">
              Controls the communication style added to the runtime system prompt
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={normalizeAssistantPersonalityId(settings.assistantPersonality)}
              onValueChange={(value) =>
                updateSettings({ assistantPersonality: value as AssistantPersonalityId })
              }
              options={ASSISTANT_PERSONALITIES.map((personality) => ({
                value: personality.id,
                label: personality.label,
              }))}
              aria-label="Assistant personality"
            />
          </div>
        </div>
      </Card>

      <h3 className="appearance-group-heading">Chat Title Generation</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Title model</h3>
            <div className="settings-list-row__description">
              Model used for automatic chat titles across all configured providers
            </div>
          </div>
          <div className="settings-list-row__control">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-[13px] text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-surface-hover)]"
                  aria-label="Title generation model"
                >
                  {selectedTitleModel ? (
                    <span className="inline-flex items-center gap-2">
                      <ProviderLogo provider={selectedProvider} size={14} />
                      <span className="truncate">{selectedTitleModel.label}</span>
                    </span>
                  ) : (
                    <span>Use current chat model</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[205px] rounded-[14px] p-0.5"
              >
                <DropdownMenuItem
                  onClick={() => updateSettings({ titleModel: '' })}
                  className="h-8 rounded-[12px] px-1.5 text-[12px]"
                >
                  <Zap className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                  <span>Use current chat model</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="mx-0 my-px h-px" />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 rounded-[12px] px-1.5 text-[12px]">
                    <SettingsIcon className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                    <span>Use separate model</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    sideOffset={8}
                    collisionPadding={12}
                    className="w-[220px] rounded-[14px] p-0.5"
                  >
                    {titleProviders.map((provider) => (
                      <DropdownMenuSub key={provider.id}>
                        <DropdownMenuSubTrigger className="h-8 rounded-[12px] px-1.5 text-[12px]">
                          <ProviderLogo provider={provider.id} size={14} />
                          <span>{provider.label}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={8}
                          collisionPadding={12}
                          className="w-[220px] max-h-[60vh] overflow-y-auto rounded-[14px] p-0.5"
                        >
                          {titleModelOptions
                            .filter((o) => o.provider === provider.id)
                            .map((option) => (
                              <DropdownMenuItem
                                key={option.value}
                                onClick={() => updateSettings({ titleModel: option.value })}
                                className="h-8 rounded-[12px] px-1.5 text-[12px]"
                              >
                                <ProviderLogo provider={option.provider} size={14} />
                                <span>{option.label}</span>
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Sidebar title reveal</h3>
            <div className="settings-list-row__description">
              Show generated titles instantly or reveal them with a typewriter effect
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={settings.titleGenerationDisplayMode || 'instant'}
              onValueChange={(value) =>
                updateSettings({ titleGenerationDisplayMode: value as 'instant' | 'typewriter' })
              }
              options={[
                { value: 'instant', label: 'Instant' },
                { value: 'typewriter', label: 'Typewriter' },
              ]}
              aria-label="Sidebar title reveal mode"
            />
          </div>
        </div>
      </Card>

      <h3 className="appearance-group-heading">Prompt Auto-Hide</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Enable prompt auto-hide</h3>
            <div className="settings-list-row__description">
              Automatically hide the chat input area after a period of inactivity. Hover the bottom
              of the chat or press any key to bring it back.
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={promptAutoHide.enabled}
              onCheckedChange={(checked) => updatePromptAutoHide({ enabled: checked })}
              aria-label="Enable prompt auto-hide"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Inactivity timeout</h3>
            <div className="settings-list-row__description">
              Seconds of inactivity before the prompt hides ({promptTimeout}s)
            </div>
          </div>
          <div
            className="settings-list-row__control"
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <input
              type="range"
              min={30}
              max={600}
              step={10}
              value={promptTimeout}
              onChange={(e) => updatePromptAutoHide({ timeout: Number(e.target.value) })}
              disabled={!promptAutoHide.enabled}
              aria-label="Prompt auto-hide timeout"
              style={{ minWidth: 120 }}
            />
            <span
              style={{
                fontSize: '0.82rem',
                color: 'var(--theme-text-muted)',
                minWidth: 40,
                textAlign: 'right',
              }}
            >
              {promptTimeout}s
            </span>
          </div>
        </div>
      </Card>

      <h3 className="appearance-group-heading">Model Selector</h3>

      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Sidebar position</h3>
            <div className="settings-list-row__description">
              Place provider sidebar on left or right
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={getModelSelector().sidebarPosition}
              onValueChange={(value) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    sidebarPosition: value as 'left' | 'right',
                  },
                })
              }
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
              aria-label="Model selector sidebar position"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Dropdown width</h3>
            <div className="settings-list-row__description">Control the overall selector size</div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={getModelSelector().dropdownWidth}
              onValueChange={(value) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    dropdownWidth: value as 'compact' | 'default' | 'wide',
                  },
                })
              }
              options={[
                { value: 'compact', label: 'Compact (420px)' },
                { value: 'default', label: 'Default (520px)' },
                { value: 'wide', label: 'Wide (640px)' },
              ]}
              aria-label="Model selector dropdown width"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show model descriptions</h3>
            <div className="settings-list-row__description">
              Display model capability descriptions
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showDescriptions}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    showDescriptions: checked,
                  },
                })
              }
              aria-label="Show model descriptions"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show capability badges</h3>
            <div className="settings-list-row__description">
              Display tools, vision, search & other capability labels
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showCapabilityBadges}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    showCapabilityBadges: checked,
                  },
                })
              }
              aria-label="Show capability badges"
            />
          </div>
        </div>

        {getModelSelector().showCapabilityBadges && (
          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Badge display</h3>
              <div className="settings-list-row__description">
                Show icon only, text only, or both
              </div>
            </div>
            <div className="settings-list-row__control">
              <SettingsSelect
                value={getModelSelector().capabilityBadgeDisplay ?? 'both'}
                onValueChange={(value) =>
                  updateSettings({
                    modelSelector: {
                      ...getModelSelector(),
                      capabilityBadgeDisplay: value as 'icon' | 'text' | 'both',
                    },
                  })
                }
                options={[
                  { value: 'icon', label: 'Icon only' },
                  { value: 'text', label: 'Text only' },
                  { value: 'both', label: 'Icon + text' },
                ]}
                aria-label="Model capability badge display"
              />
            </div>
          </div>
        )}

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show favorite stars</h3>
            <div className="settings-list-row__description">Display favorite toggle buttons</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showFavoriteStars}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    showFavoriteStars: checked,
                  },
                })
              }
              aria-label="Show favorite stars"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show context length</h3>
            <div className="settings-list-row__description">
              Display context length (e.g. 200K, 1M) next to each model
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showContextLength !== false}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    showContextLength: checked,
                  },
                })
              }
              aria-label="Show context length"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show info tooltips</h3>
            <div className="settings-list-row__description">
              Enable hover tooltips with model details
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showInfoTooltips}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    showInfoTooltips: checked,
                  },
                })
              }
              aria-label="Show info tooltips"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Active indicator style</h3>
            <div className="settings-list-row__description">
              How the selected model is highlighted
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={getModelSelector().activeIndicatorStyle}
              onValueChange={(value) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    activeIndicatorStyle: value as 'dot' | 'checkmark' | 'highlight',
                  },
                })
              }
              options={[
                { value: 'dot', label: 'Dot' },
                { value: 'checkmark', label: 'Checkmark' },
                { value: 'highlight', label: 'Highlight' },
              ]}
              aria-label="Model active indicator style"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Default view on open</h3>
            <div className="settings-list-row__description">What to show when selector opens</div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={getModelSelector().defaultView}
              onValueChange={(value) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    defaultView: value as 'favorites' | 'lastUsed',
                  },
                })
              }
              options={[
                { value: 'lastUsed', label: 'Last Used Provider' },
                { value: 'favorites', label: 'Favorites' },
              ]}
              aria-label="Model selector default view"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Auto-close on select</h3>
            <div className="settings-list-row__description">
              Close dropdown when a model is selected
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().autoCloseOnSelect}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    autoCloseOnSelect: checked,
                  },
                })
              }
              aria-label="Auto-close on select"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Remember last provider</h3>
            <div className="settings-list-row__description">
              Restore last selected provider on open
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().rememberProvider}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    rememberProvider: checked,
                  },
                })
              }
              aria-label="Remember last provider"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show search bar</h3>
            <div className="settings-list-row__description">
              Display search input for filtering models
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showSearch}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    showSearch: checked,
                  },
                })
              }
              aria-label="Show search bar"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Enable animations</h3>
            <div className="settings-list-row__description">Smooth transitions and effects</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().enableAnimations}
              onCheckedChange={(checked) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    enableAnimations: checked,
                  },
                })
              }
              aria-label="Enable animations"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Stagger animation speed</h3>
            <div className="settings-list-row__description">
              How quickly items appear in sequence
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={getModelSelector().staggerSpeed}
              onValueChange={(value) =>
                updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    staggerSpeed: value as 'fast' | 'normal' | 'slow',
                  },
                })
              }
              options={[
                { value: 'fast', label: 'Fast' },
                { value: 'normal', label: 'Normal' },
                { value: 'slow', label: 'Slow' },
              ]}
              disabled={!getModelSelector().enableAnimations}
              aria-label="Model selector stagger animation speed"
            />
          </div>
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <h4
          style={{
            margin: '0 0 6px',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: 'var(--theme-text-primary)',
          }}
        >
          Item Density
        </h4>
        <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
          Control spacing between model items.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {(['compact', 'comfortable', 'spacious'] as const).map((density) => {
            const isActive = getModelSelector().itemDensity === density
            return (
              <button
                key={density}
                onClick={() =>
                  updateSettings({
                    modelSelector: {
                      ...getModelSelector(),
                      itemDensity: density,
                    },
                  })
                }
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 12,
                  border: isActive
                    ? '1px solid var(--theme-border-hover)'
                    : '1px solid var(--theme-border)',
                  background: isActive
                    ? 'var(--theme-surface-active)'
                    : 'var(--theme-surface-subtle)',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--theme-text-primary)',
                    marginBottom: '4px',
                    textTransform: 'capitalize',
                  }}
                >
                  {density}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  {density === 'compact' && 'Tighter spacing, more models visible'}
                  {density === 'comfortable' && 'Balanced spacing for readability'}
                  {density === 'spacious' && 'More breathing room between items'}
                </div>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

interface SettingsSelectProps {
  value?: string
  onValueChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

function SettingsSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: SettingsSelectProps): React.ReactElement {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={[
          'setting-input-scira min-w-[140px] justify-between gap-3',
          disabled ? 'opacity-50' : '',
          className ?? '',
        ].join(' ')}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default AppearanceSection
