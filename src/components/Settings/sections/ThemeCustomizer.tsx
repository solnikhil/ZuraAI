/**
 * ThemeCustomizer — the "Theme" settings card (preset, accent/background/
 * foreground color pickers, and contrast). Self-contained: owns the hex-input
 * text state and all theme mutation helpers, driven only by `settings`/`onChange`.
 */

import React, { useEffect, useMemo, useState } from 'react'

import { Card } from '@/components/ui/card'
import type { Settings } from '../../../contexts/SettingsContext'
import { getThemeById, getDefaultTheme, getThemesByCategory } from '../../../themes/themeRegistry'
import { clampNumber, isValidHexColor, normalizeHexColor } from '../../../utils/colorUtils'
import { SettingsSelect } from './SettingsSelect'

interface ThemeCustomizerProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
}

export function ThemeCustomizer({ settings, onChange }: ThemeCustomizerProps): React.ReactElement {
  const updateSettings = (changes: Partial<Settings>) => onChange(changes)

  const [accentInput, setAccentInput] = useState('')
  const [backgroundInput, setBackgroundInput] = useState('')
  const [foregroundInput, setForegroundInput] = useState('')

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
    <>
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
                  onBlur={() =>
                    setAccentInput(commitThemeColor('themeAccent', accentInput, themeAccentColor))
                  }
                  onKeyDown={(event) =>
                    handleColorInputKeyDown(event, () =>
                      setAccentInput(
                        commitThemeColor('themeAccent', accentInput, themeAccentColor)
                      )
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
    </>
  )
}
