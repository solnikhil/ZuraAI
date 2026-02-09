/**
 * AppearanceSection component for Settings
 * Unified appearance settings: titlebar, chat bubble style
 *
 * @module AppearanceSection
 */

import React, { useLayoutEffect, useMemo, useState } from 'react'
import { PanelLeft, MessageSquare, Paintbrush, Command } from '../../icons'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useSettings } from '../../../contexts/SettingsContext'
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
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid var(--theme-border)',
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

export interface AppearanceSectionProps {}

export function AppearanceSection(_props: AppearanceSectionProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const currentChatBubbleStyle = settings.chatBubbleStyle || 'solid'
  const currentChatSelectedOverlayStyle = settings.chatSelectedOverlayStyle || 'linear'
  const [selectedThemeCategory, setSelectedThemeCategory] = useState('all')
  const [appearancePage, setAppearancePage] = useState<'themes' | 'titlebar' | 'chatbubbles' | 'modelselector'>('themes')
  
  // Helper to get modelSelector with defaults
  const getModelSelector = () => ({
    ...defaultSettingsUI.modelSelector!,
    ...settings.modelSelector,
  })
  const commandBar = settings.commandBar
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)
  const blurPx = clampNumber(commandBar.blurPx, 0, 30)
  const fieldSurface = clampNumber(commandBar.fieldSurface, 20, 90)
  const fieldSurfaceFocused = clampNumber(commandBar.fieldSurfaceFocused, 20, 90)
  const dropdownSurface = clampNumber(commandBar.dropdownSurface, 20, 90)

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
    <div style={{ width: '100%', padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">Appearance</h2>
        <div className="page-subtitle">Personalize themes and window presentation.</div>
      </div>

      <div
        style={{
          display: 'inline-flex',
          gap: 4,
          flexWrap: 'wrap',
          marginTop: 16,
          padding: 4,
          borderRadius: 12,
          border: '1px solid var(--theme-border)',
          background: 'var(--theme-surface)'
        }}
      >
        <button
          onClick={() => setAppearancePage('themes')}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--theme-border)',
            background: appearancePage === 'themes' ? 'var(--theme-surface-active)' : 'transparent',
            color: 'var(--theme-text-primary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            boxShadow: appearancePage === 'themes' ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
            transition: 'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease'
          }}
        >
          Themes
        </button>
        <button
          onClick={() => setAppearancePage('titlebar')}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--theme-border)',
            background: appearancePage === 'titlebar' ? 'var(--theme-surface-active)' : 'transparent',
            color: 'var(--theme-text-primary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            boxShadow: appearancePage === 'titlebar' ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
            transition: 'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease'
          }}
        >
          Titlebar
        </button>
        <button
          onClick={() => setAppearancePage('chatbubbles')}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--theme-border)',
            background: appearancePage === 'chatbubbles' ? 'var(--theme-surface-active)' : 'transparent',
            color: 'var(--theme-text-primary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            boxShadow: appearancePage === 'chatbubbles' ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
            transition: 'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease'
          }}
        >
          Chat Bubbles
        </button>
        <button
          onClick={() => setAppearancePage('modelselector')}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--theme-border)',
            background: appearancePage === 'modelselector' ? 'var(--theme-surface-active)' : 'transparent',
            color: 'var(--theme-text-primary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            boxShadow: appearancePage === 'modelselector' ? 'inset 0 0 0 1px var(--theme-border-hover)' : 'none',
            transition: 'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease'
          }}
        >
          Model Selector
        </button>
      </div>

      {appearancePage === 'themes' && (
        <Card className="settings-section-card" style={{ marginTop: 24 }}>
          <h3 style={{
            margin: '0 0 8px',
            fontSize: '1.05rem',
            fontWeight: 600,
            color: 'var(--theme-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Paintbrush size={20} style={{ color: 'var(--theme-accent)' }} />
            Themes
          </h3>
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
      )}

      {appearancePage === 'titlebar' && (
        <>
          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 20px',
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <PanelLeft size={20} style={{ color: 'var(--theme-accent)' }} />
              Titlebar
            </h3>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
              borderBottom: '1px solid var(--theme-border-subtle)'
            }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                  Show App Name
                </h4>
                <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  Display the application name in the titlebar
                </p>
              </div>
              <Switch
                checked={settings.titleBarShowAppName}
                onCheckedChange={(checked) => updateSettings({ titleBarShowAppName: checked })}
                aria-label="Show app name in titlebar"
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
              borderBottom: '1px solid var(--theme-border-subtle)'
            }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                  Show Chat Title
                </h4>
                <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  Display the current chat title in the titlebar
                </p>
              </div>
              <Switch
                checked={settings.titleBarShowChatTitle}
                onCheckedChange={(checked) => updateSettings({ titleBarShowChatTitle: checked })}
                aria-label="Show chat title in titlebar"
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0'
            }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                  Show Model
                </h4>
                <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  Display the current AI model in the titlebar
                </p>
              </div>
              <Switch
                checked={settings.titleBarShowModel}
                onCheckedChange={(checked) => updateSettings({ titleBarShowModel: checked })}
                aria-label="Show model in titlebar"
              />
            </div>
          </Card>

          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Command size={18} style={{ color: 'var(--theme-accent)' }} />
              Command Bar
            </h3>
            <p style={{ margin: '0 0 16px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
              Customize titlebar command bar behavior and visual style.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Enable command bar</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Show the command bar in the titlebar</div>
                </div>
                <Switch
                  checked={commandBar.enabled}
                  onCheckedChange={(checked) => updateCommandBar({ enabled: checked })}
                  aria-label="Enable command bar in titlebar"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Size</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Controls command bar width</div>
                </div>
                <select
                  value={commandBar.size === 'medium' ? 'medium' : 'small'}
                  onChange={(e) => updateCommandBar({ size: e.target.value as 'small' | 'medium' })}
                  className="setting-input-scira"
                  style={{ width: 160 }}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Recent commands</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Show your last 1-3 commands at the top</div>
                </div>
                <Switch
                  checked={commandBar.showRecents}
                  onCheckedChange={(checked) => updateCommandBar({ showRecents: checked })}
                  aria-label="Show recent commands"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Max recents</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>How many recent commands to show</div>
                </div>
                <select
                  value={maxRecents}
                  onChange={(e) => updateCommandBar({ maxRecents: Number(e.target.value) })}
                  className="setting-input-scira"
                  style={{ width: 120 }}
                  disabled={!commandBar.showRecents}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Tab autocomplete</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Press Tab to complete commands</div>
                </div>
                <Switch
                  checked={commandBar.enableTabAutocomplete}
                  onCheckedChange={(checked) => updateCommandBar({ enableTabAutocomplete: checked })}
                  aria-label="Enable tab autocomplete"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Max results</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Limit dropdown height and clutter</div>
                </div>
                <select
                  value={maxSuggestions}
                  onChange={(e) => updateCommandBar({ maxSuggestions: Number(e.target.value) })}
                  className="setting-input-scira"
                  style={{ width: 120 }}
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Background blur</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Glass effect for the dropdown</div>
                </div>
                <Switch
                  checked={commandBar.enableBlur}
                  onCheckedChange={(checked) => updateCommandBar({ enableBlur: checked })}
                  aria-label="Enable command bar background blur"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Blur strength</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Higher values look more frosted</div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={blurPx}
                  onChange={(e) => updateCommandBar({ blurPx: Number(e.target.value) })}
                  disabled={!commandBar.enableBlur}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Field opacity</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Lower values = more transparent</div>
                </div>
                <input
                  type="range"
                  min={20}
                  max={90}
                  value={fieldSurface}
                  onChange={(e) => updateCommandBar({ fieldSurface: Number(e.target.value) })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Field opacity (focused)</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Applied when command bar is active</div>
                </div>
                <input
                  type="range"
                  min={20}
                  max={90}
                  value={fieldSurfaceFocused}
                  onChange={(e) => updateCommandBar({ fieldSurfaceFocused: Number(e.target.value) })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Dropdown opacity</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Controls suggestion transparency</div>
                </div>
                <input
                  type="range"
                  min={20}
                  max={90}
                  value={dropdownSurface}
                  onChange={(e) => updateCommandBar({ dropdownSurface: Number(e.target.value) })}
                />
              </div>
            </div>
          </Card>
        </>
      )}

      {appearancePage === 'chatbubbles' && (
        <Card className="settings-section-card" style={{ marginTop: 24 }}>
          <h3 style={{
            margin: '0 0 6px',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--theme-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <MessageSquare size={20} style={{ color: 'var(--theme-accent)' }} />
            Chat Bubble Style
          </h3>
          <p style={{
            margin: '0 0 18px',
            color: 'var(--theme-text-muted)',
            fontSize: '0.85rem'
          }}>
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
      )}

      {appearancePage === 'modelselector' && (
        <>
          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <PanelLeft size={20} style={{ color: 'var(--theme-accent)' }} />
              Layout
            </h3>
            <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
              Configure the model selector layout and positioning.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Sidebar position</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Place provider sidebar on left or right</div>
                </div>
                <select
                  value={getModelSelector().sidebarPosition}
                  onChange={(e) => updateSettings({ 
                    modelSelector: { 
                      ...getModelSelector(),
                      sidebarPosition: e.target.value as 'left' | 'right'
                    } 
                  })}
                  className="setting-input-scira"
                  style={{ width: 160 }}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show sidebar labels</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Display provider names alongside icons</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show model count badges</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Display number of models per provider</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Dropdown width</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Control the overall selector size</div>
                </div>
                <select
                  value={getModelSelector().dropdownWidth}
                  onChange={(e) => updateSettings({ 
                    modelSelector: { 
                      ...getModelSelector(),
                      dropdownWidth: e.target.value as 'compact' | 'default' | 'wide'
                    } 
                  })}
                  className="setting-input-scira"
                  style={{ width: 160 }}
                >
                  <option value="compact">Compact (420px)</option>
                  <option value="default">Default (520px)</option>
                  <option value="wide">Wide (640px)</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <MessageSquare size={20} style={{ color: 'var(--theme-accent)' }} />
              Display
            </h3>
            <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
              Control what information is shown for each model.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show model descriptions</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Display model capability descriptions</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show capability badges</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Display vision/code/reasoning icons</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show provider logos</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Use provider logos instead of fallback icons</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show favorite stars</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Display favorite toggle buttons</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show info tooltips</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Enable hover tooltips with model details</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Active indicator style</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>How the selected model is highlighted</div>
                </div>
                <select
                  value={getModelSelector().activeIndicatorStyle}
                  onChange={(e) => updateSettings({ 
                    modelSelector: { 
                      ...getModelSelector(),
                      activeIndicatorStyle: e.target.value as 'dot' | 'checkmark' | 'highlight'
                    } 
                  })}
                  className="setting-input-scira"
                  style={{ width: 160 }}
                >
                  <option value="dot">Dot</option>
                  <option value="checkmark">Checkmark</option>
                  <option value="highlight">Highlight</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Paintbrush size={20} style={{ color: 'var(--theme-accent)' }} />
              Density
            </h3>
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

          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Command size={18} style={{ color: 'var(--theme-accent)' }} />
              Behavior
            </h3>
            <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
              Configure how the model selector behaves.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Default view on open</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>What to show when selector opens</div>
                </div>
                <select
                  value={getModelSelector().defaultView}
                  onChange={(e) => updateSettings({ 
                    modelSelector: { 
                      ...getModelSelector(),
                      defaultView: e.target.value as 'favorites' | 'lastUsed'
                    } 
                  })}
                  className="setting-input-scira"
                  style={{ width: 160 }}
                >
                  <option value="lastUsed">Last Used Provider</option>
                  <option value="favorites">Favorites</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Auto-close on select</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Close dropdown when a model is selected</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Remember last provider</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Restore last selected provider on open</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Show search bar</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Display search input for filtering models</div>
                </div>
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
          </Card>

          <Card className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Paintbrush size={20} style={{ color: 'var(--theme-accent)' }} />
              Animations
            </h3>
            <p style={{ margin: '0 0 14px', color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
              Control animation effects and timing.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Enable animations</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>Smooth transitions and effects</div>
                </div>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Stagger animation speed</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>How quickly items appear in sequence</div>
                </div>
                <select
                  value={getModelSelector().staggerSpeed}
                  onChange={(e) => updateSettings({ 
                    modelSelector: { 
                      ...getModelSelector(),
                      staggerSpeed: e.target.value as 'fast' | 'normal' | 'slow'
                    } 
                  })}
                  className="setting-input-scira"
                  style={{ width: 160 }}
                  disabled={!getModelSelector().enableAnimations}
                >
                  <option value="fast">Fast</option>
                  <option value="normal">Normal</option>
                  <option value="slow">Slow</option>
                </select>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

export default AppearanceSection
