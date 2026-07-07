/**
 * AppearanceSection component for Settings
 * Continuous vertical layout for all appearance settings.
 *
 */

import React, { useEffect, useMemo } from 'react'

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
import type { AppChromeMaterial, ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'
import {
  ASSISTANT_PERSONALITIES,
  normalizeAssistantPersonalityId,
  type AssistantPersonalityId,
} from '../../../prompts/assistantPersonalities'
import { getThemesByCategory, type ThemeMode } from '../../../themes/themeRegistry'
import {
  DEFAULT_FONT_SCALE,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  FONT_SCALE_STEP,
  normalizeFontScale,
} from '../../../themes/themeUtils'
import { getAvailableTitleModelOptions, getProviderDefinition } from '../../../providers'

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

function AppearanceModePreviewWorkspace(): React.ReactElement {
  return (
    <span className="appearance-mode-picker__preview-main">
      <span />
      <span />
      <span />
    </span>
  )
}

function AppearanceModePreview({
  mode,
}: {
  mode: 'system' | 'light' | 'dark'
}): React.ReactElement {
  if (mode === 'system') {
    return (
      <span
        className="appearance-mode-picker__preview appearance-mode-picker__preview--system"
        aria-hidden="true"
      >
        <span className="appearance-mode-picker__preview-duo">
          <span className="appearance-mode-picker__preview-pane appearance-mode-picker__preview-pane--light">
            <span className="appearance-mode-picker__preview-sidebar appearance-mode-picker__preview-sidebar--light" />
            <AppearanceModePreviewWorkspace />
          </span>
          <span className="appearance-mode-picker__preview-pane appearance-mode-picker__preview-pane--dark">
            <span className="appearance-mode-picker__preview-sidebar appearance-mode-picker__preview-sidebar--dark" />
            <AppearanceModePreviewWorkspace />
          </span>
        </span>
      </span>
    )
  }

  return (
    <span
      className={`appearance-mode-picker__preview appearance-mode-picker__preview--${mode}`}
      aria-hidden="true"
    >
      <span
        className={`appearance-mode-picker__preview-sidebar appearance-mode-picker__preview-sidebar--${mode}`}
      />
      <AppearanceModePreviewWorkspace />
    </span>
  )
}

const appearanceModeOptions: Array<{
  mode: 'system' | 'light' | 'dark'
  label: string
  description: string
}> = [
  {
    mode: 'system',
    label: 'System',
    description: 'Follow Windows theme',
  },
  {
    mode: 'light',
    label: 'Light',
    description: 'Warm paper workspace',
  },
  {
    mode: 'dark',
    label: 'Dark',
    description: 'Original graphite workspace',
  },
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
  // Consume the initialCommandPaletteTab param (no longer needed for tab switching but keep the callback)
  useEffect(() => {
    if (initialCommandPaletteTab) {
      onParamsConsumed?.()
    }
  }, [initialCommandPaletteTab, onParamsConsumed])

  const commandBar = settings.commandBar
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)
  const overlayOpacity = clampNumber(commandBar.overlayOpacity, 0, 80)
  const promptAutoHide = settings.promptAutoHide
  const promptTimeout = clampNumber(promptAutoHide.timeout, 30, 600)
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

  const currentContrast = settings.themeContrast ?? 100
  const currentFontScale = normalizeFontScale(settings.fontScale ?? DEFAULT_FONT_SCALE)

  const allThemes = useMemo(() => getThemesByCategory('all'), [])
  const hasCustomThemeOverrides = currentContrast !== 100
  const activeThemeMode: ThemeMode = settings.theme

  const handleThemePresetChange = (themeId: string) => {
    updateSettings({
      activeTheme: themeId,
      themeAccent: undefined,
      themeBackground: undefined,
      themeForeground: undefined,
      themeContrast: 100,
    })
  }

  const handleThemeModeChange = (mode: ThemeMode) => {
    if (mode === activeThemeMode) return
    updateSettings({
      theme: mode,
      themeAccent: undefined,
      themeBackground: undefined,
      themeForeground: undefined,
      themeContrast: 100,
    })
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

  const handleFontScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ fontScale: normalizeFontScale(Number(e.target.value)) })
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
          <div className="settings-list-row settings-list-row--appearance-mode">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Appearance mode</h3>
              <div className="settings-list-row__description">
                Pick a visual theme with preview cards
              </div>
            </div>
            <div className="settings-list-row__control settings-list-row__control--stretch">
              <div
                className="appearance-mode-picker"
                role="radiogroup"
                aria-label="Appearance mode"
              >
                {appearanceModeOptions.map((option) => {
                  const isActive = activeThemeMode === option.mode

                  return (
                    <button
                      key={option.mode}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      className="appearance-mode-picker__card"
                      data-mode={option.mode}
                      data-active={isActive ? 'true' : 'false'}
                      onClick={() => handleThemeModeChange(option.mode)}
                    >
                      <AppearanceModePreview mode={option.mode} />
                      <span className="appearance-mode-picker__body">
                        <span className="appearance-mode-picker__label">{option.label}</span>
                        <span className="appearance-mode-picker__description">
                          {option.description}
                        </span>
                      </span>
                      <span className="appearance-mode-picker__check" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Preset</h3>
              <div className="settings-list-row__description">
                Choose a base theme preset for the active appearance mode
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

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Text size</h3>
              <div className="settings-list-row__description">
                Scale app text while keeping the current layout density
              </div>
            </div>
            <div className="settings-list-row__control">
              <div className="theme-contrast-control">
                <input
                  type="range"
                  min={MIN_FONT_SCALE}
                  max={MAX_FONT_SCALE}
                  step={FONT_SCALE_STEP}
                  value={currentFontScale}
                  onChange={handleFontScaleChange}
                  className="theme-contrast-slider"
                  aria-label="Text size slider"
                />
                <span className="theme-contrast-value">{currentFontScale}%</span>
              </div>
            </div>
          </div>

          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Sidebar and titlebar material</h3>
              <div className="settings-list-row__description">
                Choose a solid chrome surface or native acrylic transparency
              </div>
            </div>
            <div className="settings-list-row__control">
              <SettingsSelect
                value={settings.appChromeMaterial ?? 'acrylic'}
                onValueChange={(value) =>
                  updateSettings({ appChromeMaterial: value as AppChromeMaterial })
                }
                options={[
                  { value: 'acrylic', label: 'Acrylic' },
                  { value: 'solid', label: 'Solid' },
                ]}
                aria-label="Sidebar and titlebar material"
              />
            </div>
          </div>
        </div>
      </Card>

      <h3 className="appearance-group-heading">Command Palette</h3>
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
      </Card>

      <h3 className="appearance-group-heading">Chat</h3>
      <Card
        className="settings-section-card settings-section-card--style-gallery"
        aria-labelledby="appearance-chat-styles-heading"
      >
        <section
          className="appearance-chat-styles"
          aria-labelledby="appearance-chat-styles-heading"
        >
          <h4 id="appearance-chat-styles-heading" className="appearance-chat-styles__title">
            Message appearance
          </h4>
          <p className="appearance-chat-styles__description">
            Customize how chat messages and sidebar highlights look in the dashboard.
          </p>

          <div className="appearance-style-gallery__section">
            <h5 className="appearance-style-gallery__section-title">Bubble style</h5>
            <p className="appearance-style-gallery__section-description">
              Choose how your user messages are rendered in dashboard chat.
            </p>

            <div
              className="appearance-style-picker"
              role="radiogroup"
              aria-label="Chat bubble style"
            >
              {chatBubblePresets.map((preset) => {
                const isActive = currentChatBubbleStyle === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    data-active={isActive ? 'true' : 'false'}
                    className="appearance-style-picker__card"
                    onClick={() => updateSettings({ chatBubbleStyle: preset.id })}
                  >
                    <div
                      className="appearance-style-picker__bubble-preview"
                      style={preset.previewStyle}
                    >
                      who are you
                    </div>
                    <div className="appearance-style-picker__label">{preset.label}</div>
                    <div className="appearance-style-picker__description">{preset.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="appearance-style-subsection">
            <h4 className="appearance-style-subsection__title">Chat Selected Overlay</h4>
            <p className="appearance-style-subsection__description">
              Choose the selected chat highlight style in the sidebar.
            </p>

            <div
              className="appearance-style-picker"
              role="radiogroup"
              aria-label="Chat selected overlay style"
            >
              {chatSelectedOverlayPresets.map((preset) => {
                const isActive = currentChatSelectedOverlayStyle === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    data-active={isActive ? 'true' : 'false'}
                    className="appearance-style-picker__card"
                    onClick={() => updateSettings({ chatSelectedOverlayStyle: preset.id })}
                  >
                    <div
                      className="appearance-style-picker__overlay-preview"
                      style={preset.previewStyle}
                    >
                      <span className="appearance-style-picker__overlay-preview-label">
                        Opensource
                      </span>
                      <span className="appearance-style-picker__overlay-preview-meta">...</span>
                    </div>
                    <div className="appearance-style-picker__label">{preset.label}</div>
                    <div className="appearance-style-picker__description">{preset.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="appearance-style-subsection">
            <h4 className="appearance-style-subsection__title">Empty State Placeholder</h4>
            <p className="appearance-style-subsection__description">
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
        </section>
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
                  className="zura-menu-trigger inline-flex items-center gap-2 px-3 py-1.5 text-[13px]"
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
                className="settings-menu-surface zura-menu-surface--model w-[205px]"
              >
                <DropdownMenuItem
                  onClick={() => updateSettings({ titleModel: '' })}
                  className="zura-menu-item--model"
                >
                  <Zap className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                  <span>Use current chat model</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="zura-menu-sub-trigger--model">
                    <SettingsIcon className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                    <span>Use separate model</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    sideOffset={8}
                    collisionPadding={12}
                    className="settings-menu-surface zura-menu-surface--model w-[220px]"
                  >
                    {titleProviders.map((provider) => (
                      <DropdownMenuSub key={provider.id}>
                        <DropdownMenuSubTrigger className="zura-menu-sub-trigger--model">
                          <ProviderLogo provider={provider.id} size={14} />
                          <span>{provider.label}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={8}
                          collisionPadding={12}
                          className="settings-menu-surface zura-menu-surface--model w-[220px] max-h-[60vh] overflow-y-auto"
                        >
                          {titleModelOptions
                            .filter((o) => o.provider === provider.id)
                            .map((option) => (
                              <DropdownMenuItem
                                key={option.value}
                                onClick={() => updateSettings({ titleModel: option.value })}
                                className="zura-menu-item--model"
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
  'aria-label'?: string
}

function SettingsSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
  'aria-label': ariaLabelAttribute,
}: SettingsSelectProps): React.ReactElement {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={[
          'min-w-[140px] justify-between gap-3',
          disabled ? 'opacity-50' : '',
          className ?? '',
        ].join(' ')}
        aria-label={ariaLabel ?? ariaLabelAttribute}
      >
        <SelectValue placeholder={placeholder} />
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

export default AppearanceSection
