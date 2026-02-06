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

export interface AppearanceSectionProps {}

export function AppearanceSection(_props: AppearanceSectionProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const currentChatBubbleStyle = settings.chatBubbleStyle || 'solid'
  const [selectedThemeCategory, setSelectedThemeCategory] = useState('all')
  const [appearancePage, setAppearancePage] = useState<'themes' | 'titlebar' | 'chatbubbles'>('themes')
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
            Pick the look and feel for dashboard, settings, and overlay controls.
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
        </Card>
      )}
    </div>
  )
}

export default AppearanceSection
