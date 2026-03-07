/**
 * AppearanceSection component for Settings
 * Continuous vertical layout for all appearance settings.
 *
 * @module AppearanceSection
 */

import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '../../../contexts/SettingsContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'
import { defaultSettingsUI } from '../../../contexts/SettingsUIContext'
import { getThemeById, getDefaultTheme, getThemesByCategory, themeCategories } from '../../../themes/themeRegistry'
import { applyThemeToDocument } from '../../../themes/themeUtils'

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
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-user-message-text)'
    }
  },
  {
    id: 'glass',
    label: 'Soft Glass',
    description: 'Translucent bubble with blur and border',
    previewStyle: {
      background: 'rgba(148, 163, 184, 0.18)',
      border: '1px solid rgba(255, 255, 255, 0.22)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-text-primary)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)'
    }
  },
  {
    id: 'outline',
    label: 'Outline Minimal',
    description: 'Transparent bubble with accent outline',
    previewStyle: {
      background: 'transparent',
      border: '1px solid var(--theme-accent-muted)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)'
    }
  },
  {
    id: 'gradient',
    label: 'Gradient Pop',
    description: 'Accent gradient bubble with stronger contrast',
    previewStyle: {
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 82%, transparent) 0%, color-mix(in srgb, var(--theme-accent-secondary) 78%, transparent) 100%)',
      border: '1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-text-inverse)'
    }
  },
  {
    id: 'elevated',
    label: 'Elevated Card',
    description: 'Surface card with stronger depth and border',
    previewStyle: {
      background: 'var(--theme-surface)',
      border: '1px solid var(--theme-border)',
      boxShadow: 'var(--theme-shadow-md)',
      color: 'var(--theme-text-primary)'
    }
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
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      letterSpacing: '0.01em'
    }
  }
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
    }
  },
  {
    id: 'notion',
    label: 'Notion Soft',
    description: 'Calm, low-contrast solid selection',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-hover) 82%, transparent)',
      border: '1px solid transparent',
      boxShadow: 'none',
    }
  },
  {
    id: 'slack',
    label: 'Slack Tint',
    description: 'Solid accent-tinted selection for focus',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-accent) 16%, var(--theme-surface-active))',
      border: '1px solid color-mix(in srgb, var(--theme-accent) 28%, transparent)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
    }
  },
  {
    id: 'discord',
    label: 'Discord Solid',
    description: 'Chunky neutral fill with soft border',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-active) 92%, var(--theme-surface) 8%)',
      border: '1px solid color-mix(in srgb, var(--theme-border) 62%, transparent)',
      boxShadow: 'none',
    }
  },
  {
    id: 'github',
    label: 'GitHub Subtle',
    description: 'Clean card-like active row with restraint',
    previewStyle: {
      background: 'color-mix(in srgb, var(--theme-surface-active) 86%, transparent)',
      border: '1px solid color-mix(in srgb, var(--theme-border) 78%, transparent)',
      boxShadow: 'none',
    }
  },
]

export interface AppearanceSectionProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
  initialCommandPaletteTab?: boolean
  onParamsConsumed?: () => void
}

type TitleProviderKey = 'openrouter' | 'ollama' | 'perplexity' | 'groq' | 'alibaba'

const TITLE_PROVIDER_OPTIONS: Array<{ key: TitleProviderKey; label: string }> = [
  { key: 'openrouter', label: 'OpenRouter' },
  { key: 'groq', label: 'Groq' },
  { key: 'alibaba', label: 'Alibaba Cloud' },
  { key: 'perplexity', label: 'Perplexity' },
  { key: 'ollama', label: 'Ollama' },
]

export function AppearanceSection({
  settings,
  onChange,
  initialCommandPaletteTab,
  onParamsConsumed,
}: AppearanceSectionProps): React.ReactElement {
  const updateSettings = (changes: Partial<typeof settings>) => onChange(changes)
  const currentChatBubbleStyle = settings.chatBubbleStyle || 'solid'
  const currentChatSelectedOverlayStyle = settings.chatSelectedOverlayStyle || 'linear'
  const [selectedThemeCategory, setSelectedThemeCategory] = useState('all')

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
  const titleProvider = (settings.titleModelProvider || 'openrouter') as TitleProviderKey

  const titleProviderModelMap = useMemo(() => ({
    openrouter: settings.configuredModels || [],
    perplexity: settings.perplexityModels || [],
    groq: settings.groqModels || [],
    alibaba: settings.alibabaModels || [],
    ollama: settings.ollamaModels || [],
  }), [
    settings.configuredModels,
    settings.perplexityModels,
    settings.groqModels,
    settings.alibabaModels,
    settings.ollamaModels,
  ])

  const titleProviderModelsAll = titleProviderModelMap[titleProvider] || []
  const titleProviderEnabledModels = titleProviderModelsAll.filter((model) => model.enabled !== false)
  const titleProviderModels = titleProviderEnabledModels.length > 0 ? titleProviderEnabledModels : titleProviderModelsAll

  const handleTitleProviderChange = (provider: TitleProviderKey) => {
    const nextModelsAll = titleProviderModelMap[provider] || []
    const nextEnabled = nextModelsAll.filter((model) => model.enabled !== false)
    const nextCandidates = nextEnabled.length > 0 ? nextEnabled : nextModelsAll
    const nextTitleModel = nextCandidates.some((model) => model.code === settings.titleModel)
      ? settings.titleModel
      : (nextCandidates[0]?.code || settings.titleModel)

    updateSettings({
      titleModelProvider: provider,
      titleModel: nextTitleModel,
    })
  }

  const updateCommandBar = (changes: Partial<typeof settings.commandBar>) => {
    updateSettings({
      commandBar: {
        ...settings.commandBar,
        ...changes
      }
    })
  }

  const filteredThemes = useMemo(() => {
    return getThemesByCategory(selectedThemeCategory)
  }, [selectedThemeCategory])

  useLayoutEffect(() => {
    const theme = getThemeById(settings.activeTheme) || getDefaultTheme()
    applyThemeToDocument(theme)
  }, [settings.activeTheme])


  return (
    <div className="settings-section-layout settings-section-layout--wide" style={{ width: '100%' }}>
      <div className="page-header">
        <h2 className="page-title">Appearance</h2>
        <div className="page-subtitle">Personalize themes and window presentation.</div>
      </div>

      {/* ── Themes ── */}
      <h3 className="appearance-group-heading">Themes</h3>
      <Card className="settings-section-card">
        <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
          Pick the look and feel for dashboard and settings.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {themeCategories.map((category) => {
            const isActive = selectedThemeCategory === category.id
            return (
              <button
                key={category.id}
                onClick={() => setSelectedThemeCategory(category.id)}
                style={{
                  border: isActive ? '1px solid var(--theme-border-hover)' : '1px solid var(--theme-border)',
                  background: isActive ? 'var(--theme-surface-active)' : 'var(--theme-surface-subtle)',
                  color: 'var(--theme-text-primary)',
                  borderRadius: 999,
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {category.name}
              </button>
            )
          })}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12
        }}>
          {filteredThemes.map((theme) => {
            const isActive = settings.activeTheme === theme.id
            return (
              <button
                key={theme.id}
                onClick={() => updateSettings({ activeTheme: theme.id, theme: theme.isDark ? 'dark' : 'light' })}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 12,
                  border: isActive ? '1px solid var(--theme-border-hover)' : '1px solid var(--theme-border)',
                  background: isActive ? 'var(--theme-surface-active)' : 'var(--theme-surface-subtle)',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                  <div style={{ height: 16, borderRadius: 6, background: theme.colors.background }} />
                  <div style={{ height: 16, borderRadius: 6, background: theme.colors.surface }} />
                  <div style={{ height: 16, borderRadius: 6, background: theme.colors.accent }} />
                  <div style={{ height: 16, borderRadius: 6, background: theme.colors.textPrimary }} />
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
                  {theme.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  {theme.description || 'Theme preset'}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── Command Palette ── */}
      <h3 className="appearance-group-heading">Command Palette</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Enable command palette</h3>
            <div className="settings-list-row__description">Show the floating command palette when activated via keyboard shortcut</div>
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
            <div className="settings-list-row__description">Show recently executed commands at the top of the palette</div>
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
            <select
              value={maxRecents}
              onChange={(e) => updateCommandBar({ maxRecents: Number(e.target.value) })}
              className="setting-input-scira"
              disabled={!commandBar.showRecents}
              aria-label="Max recent commands in command palette"
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Tab autocomplete</h3>
            <div className="settings-list-row__description">Press Tab to complete the highlighted command</div>
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
            <div className="settings-list-row__description">Maximum number of suggestions shown in the results list</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={maxSuggestions}
              onChange={(e) => updateCommandBar({ maxSuggestions: Number(e.target.value) })}
              className="setting-input-scira"

              aria-label="Max results in command palette"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Overlay opacity</h3>
            <div className="settings-list-row__description">Controls how much the background is dimmed</div>
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
            <div className="settings-list-row__description">Controls the maximum width of the palette</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={commandBar.paletteWidth ?? 'default'}
              onChange={(e) => updateCommandBar({ paletteWidth: e.target.value as 'narrow' | 'default' | 'wide' })}
              className="setting-input-scira"

              aria-label="Command palette width"
            >
              <option value="narrow">Narrow (440px)</option>
              <option value="default">Default (560px)</option>
              <option value="wide">Wide (680px)</option>
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Vertical position</h3>
            <div className="settings-list-row__description">Controls the vertical placement of the palette</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={commandBar.palettePosition ?? 'center'}
              onChange={(e) => updateCommandBar({ palettePosition: e.target.value as 'top' | 'center' | 'lower' })}
              className="setting-input-scira"

              aria-label="Command palette vertical position"
            >
              <option value="top">Top (12%)</option>
              <option value="center">Center (20%)</option>
              <option value="lower">Lower (30%)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Chat Bubbles ── */}
      <h3 className="appearance-group-heading">Chat Bubbles</h3>
      <Card className="settings-section-card">
        <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
          Choose how your user messages are rendered in dashboard chat.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px'
        }}>
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
                  border: isActive ? '1px solid var(--theme-border-hover)' : '1px solid var(--theme-border)',
                  background: isActive ? 'var(--theme-surface-active)' : 'var(--theme-surface-subtle)',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  display: 'inline-block',
                  padding: '9px 14px',
                  borderRadius: '18px 18px 6px 18px',
                  fontSize: '0.85rem',
                  marginBottom: '10px',
                  ...preset.previewStyle
                }}>
                  who are you
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: '4px' }}>
                  {preset.label}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  {preset.description}
                </div>
              </button>
            )
          })}
        </div>

        <div style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: '1px solid var(--theme-border-subtle)'
        }}>
          <h4 style={{
            margin: '0 0 6px',
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--theme-text-primary)'
          }}>
            Chat Selected Overlay
          </h4>
          <p style={{
            margin: '0 0 14px',
            fontSize: '0.82rem',
            color: 'var(--theme-text-muted)'
          }}>
            Choose the selected chat highlight style in the sidebar.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px'
          }}>
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
                    border: isActive ? '1px solid var(--theme-border-hover)' : '1px solid var(--theme-border)',
                    background: isActive ? 'var(--theme-surface-active)' : 'var(--theme-surface-subtle)',
                    boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 10px',
                    marginBottom: 10,
                    ...preset.previewStyle
                  }}>
                    <span style={{
                      fontSize: '0.82rem',
                      color: 'var(--theme-text-primary)',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      Prompt Optimization Guide
                    </span>
                    <span style={{
                      marginLeft: 8,
                      color: 'var(--theme-text-muted)',
                      fontSize: '0.85rem',
                      lineHeight: 1
                    }}>
                      ...
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: '4px' }}>
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
      </Card>

      {/* ── Chat Title Generation ── */}
      <h3 className="appearance-group-heading">Chat Title Generation</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Title provider</h3>
            <div className="settings-list-row__description">Choose which provider generates automatic chat titles</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={titleProvider}
              onChange={(e) => handleTitleProviderChange(e.target.value as TitleProviderKey)}
              className="setting-input-scira"
              aria-label="Title generation provider"
            >
              {TITLE_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.key} value={provider.key}>{provider.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Title model</h3>
            <div className="settings-list-row__description">Model used for auto-title generation under the selected provider</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={settings.titleModel}
              onChange={(e) => updateSettings({ titleModel: e.target.value })}
              className="setting-input-scira"
              aria-label="Title generation model"
            >
              {titleProviderModels.map((model) => (
                <option key={model.code} value={model.code}>{model.displayName}</option>
              ))}
              {!titleProviderModels.some((model) => model.code === settings.titleModel) && settings.titleModel && (
                <option value={settings.titleModel}>{settings.titleModel}</option>
              )}
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Sidebar title reveal</h3>
            <div className="settings-list-row__description">Show generated titles instantly or reveal them with a typewriter effect</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={settings.titleGenerationDisplayMode || 'instant'}
              onChange={(e) => updateSettings({ titleGenerationDisplayMode: e.target.value as 'instant' | 'typewriter' })}
              className="setting-input-scira"
              aria-label="Sidebar title reveal mode"
            >
              <option value="instant">Instant</option>
              <option value="typewriter">Typewriter</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Model Selector ── */}
      <h3 className="appearance-group-heading">Model Selector</h3>

      {/* Layout */}
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Sidebar position</h3>
            <div className="settings-list-row__description">Place provider sidebar on left or right</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={getModelSelector().sidebarPosition}
              onChange={(e) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  sidebarPosition: e.target.value as 'left' | 'right'
                }
              })}
              className="setting-input-scira"

            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show sidebar labels</h3>
            <div className="settings-list-row__description">Display provider names alongside icons</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().sidebarShowLabels}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  sidebarShowLabels: checked
                }
              })}
              aria-label="Show sidebar labels"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show model count badges</h3>
            <div className="settings-list-row__description">Display number of models per provider</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().sidebarShowModelCount}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  sidebarShowModelCount: checked
                }
              })}
              aria-label="Show model count badges"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Dropdown width</h3>
            <div className="settings-list-row__description">Control the overall selector size</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={getModelSelector().dropdownWidth}
              onChange={(e) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  dropdownWidth: e.target.value as 'compact' | 'default' | 'wide'
                }
              })}
              className="setting-input-scira"

            >
              <option value="compact">Compact (420px)</option>
              <option value="default">Default (520px)</option>
              <option value="wide">Wide (640px)</option>
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show model descriptions</h3>
            <div className="settings-list-row__description">Display model capability descriptions</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showDescriptions}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showDescriptions: checked
                }
              })}
              aria-label="Show model descriptions"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show capability badges</h3>
            <div className="settings-list-row__description">Display tools, vision, search & other capability labels</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showCapabilityBadges}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showCapabilityBadges: checked
                }
              })}
              aria-label="Show capability badges"
            />
          </div>
        </div>

        {getModelSelector().showCapabilityBadges && (
          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Badge display</h3>
              <div className="settings-list-row__description">Show icon only, text only, or both</div>
            </div>
            <div className="settings-list-row__control">
              <select
                value={getModelSelector().capabilityBadgeDisplay ?? 'both'}
                onChange={(e) => updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    capabilityBadgeDisplay: e.target.value as 'icon' | 'text' | 'both'
                  }
                })}
                className="setting-input-scira"
  
              >
                <option value="icon">Icon only</option>
                <option value="text">Text only</option>
                <option value="both">Icon + text</option>
              </select>
            </div>
          </div>
        )}

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show provider logos</h3>
            <div className="settings-list-row__description">Use provider logos instead of fallback icons</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showProviderLogos}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showProviderLogos: checked
                }
              })}
              aria-label="Show provider logos"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show favorite stars</h3>
            <div className="settings-list-row__description">Display favorite toggle buttons</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showFavoriteStars}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showFavoriteStars: checked
                }
              })}
              aria-label="Show favorite stars"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show context length</h3>
            <div className="settings-list-row__description">Display context length (e.g. 200K, 1M) next to each model</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showContextLength !== false}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showContextLength: checked
                }
              })}
              aria-label="Show context length"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show info tooltips</h3>
            <div className="settings-list-row__description">Enable hover tooltips with model details</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showInfoTooltips}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showInfoTooltips: checked
                }
              })}
              aria-label="Show info tooltips"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Active indicator style</h3>
            <div className="settings-list-row__description">How the selected model is highlighted</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={getModelSelector().activeIndicatorStyle}
              onChange={(e) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  activeIndicatorStyle: e.target.value as 'dot' | 'checkmark' | 'highlight'
                }
              })}
              className="setting-input-scira"

            >
              <option value="dot">Dot</option>
              <option value="checkmark">Checkmark</option>
              <option value="highlight">Highlight</option>
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Default view on open</h3>
            <div className="settings-list-row__description">What to show when selector opens</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={getModelSelector().defaultView}
              onChange={(e) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  defaultView: e.target.value as 'favorites' | 'lastUsed'
                }
              })}
              className="setting-input-scira"

            >
              <option value="lastUsed">Last Used Provider</option>
              <option value="favorites">Favorites</option>
            </select>
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Auto-close on select</h3>
            <div className="settings-list-row__description">Close dropdown when a model is selected</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().autoCloseOnSelect}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  autoCloseOnSelect: checked
                }
              })}
              aria-label="Auto-close on select"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Remember last provider</h3>
            <div className="settings-list-row__description">Restore last selected provider on open</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().rememberProvider}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  rememberProvider: checked
                }
              })}
              aria-label="Remember last provider"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Show search bar</h3>
            <div className="settings-list-row__description">Display search input for filtering models</div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={getModelSelector().showSearch}
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  showSearch: checked
                }
              })}
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
              onCheckedChange={(checked) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  enableAnimations: checked
                }
              })}
              aria-label="Enable animations"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Stagger animation speed</h3>
            <div className="settings-list-row__description">How quickly items appear in sequence</div>
          </div>
          <div className="settings-list-row__control">
            <select
              value={getModelSelector().staggerSpeed}
              onChange={(e) => updateSettings({
                modelSelector: {
                  ...getModelSelector(),
                  staggerSpeed: e.target.value as 'fast' | 'normal' | 'slow'
                }
              })}
              className="setting-input-scira"

              disabled={!getModelSelector().enableAnimations}
            >
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="slow">Slow</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Model Selector Density ── */}
      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <h4 style={{
          margin: '0 0 6px',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: 'var(--theme-text-primary)'
        }}>
          Item Density
        </h4>
        <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
          Control spacing between model items.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12
        }}>
          {(['compact', 'comfortable', 'spacious'] as const).map((density) => {
            const isActive = getModelSelector().itemDensity === density
            return (
              <button
                key={density}
                onClick={() => updateSettings({
                  modelSelector: {
                    ...getModelSelector(),
                    itemDensity: density
                  }
                })}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 12,
                  border: isActive ? '1px solid var(--theme-border-hover)' : '1px solid var(--theme-border)',
                  background: isActive ? 'var(--theme-surface-active)' : 'var(--theme-surface-subtle)',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: '4px', textTransform: 'capitalize' }}>
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

export default AppearanceSection
