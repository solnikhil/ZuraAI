/**
 * AppearanceSection component for Settings
 * Continuous vertical layout for all appearance settings.
 *
 */

import React, { useEffect } from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '../../../contexts/SettingsContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'
import { defaultSettingsUI } from '../../../contexts/SettingsUIContext'
import { clampNumber } from '../../../utils/colorUtils'
import { SettingsSelect } from './SettingsSelect'
import { ThemeCustomizer } from './ThemeCustomizer'
import { TitleGenerationSettings } from './TitleGenerationSettings'

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

  return (
    <div
      className="settings-section-layout settings-section-layout--wide"
      style={{ width: '100%' }}
    >
      <div className="page-header">
        <h2 className="page-title">Appearance</h2>
        <div className="page-subtitle">Personalize themes and window presentation.</div>
      </div>

      <ThemeCustomizer settings={settings} onChange={onChange} />

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

      <TitleGenerationSettings settings={settings} onChange={onChange} />

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

export default AppearanceSection
