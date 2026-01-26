/**
 * AppearanceSection component for Settings
 * Wraps ThemesPage for theme customization
 *
 * @module AppearanceSection
 * Requirements: 2.4
 */

import React, { useLayoutEffect, useState } from 'react'
import { PanelLeft, Box } from '../../icons'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import ThemesPage from '../../ThemesPage'
import { useSettings } from '../../../contexts/SettingsContext'
import { getThemeById, getDefaultTheme } from '../../../themes/themeRegistry'
import { applyThemeToDocument } from '../../../themes/themeUtils'

/**
 * Props for AppearanceSection component
 */
export interface AppearanceSectionProps {
  // Currently no props needed as ThemesPage manages its own state
}

/**
 * AppearanceSection - Theme customization wrapper
 * Ensures theme is properly applied when viewing themes settings
 * Delegates to ThemesPage component for theme selection
 */
export function AppearanceSection(_props: AppearanceSectionProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const [activeTab, setActiveTab] = useState<'themes' | 'titlebar'>('themes')

  // Ensure theme is applied when this section mounts
  useLayoutEffect(() => {
    const theme = getThemeById(settings.activeTheme) || getDefaultTheme()
    applyThemeToDocument(theme)
  }, [settings.activeTheme])

  return (
    <div style={{ width: '100%' }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '4px',
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: '12px',
        padding: '4px',
        marginBottom: '24px',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setActiveTab('themes')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'themes' ? 'var(--theme-surface-active)' : 'transparent',
            color: 'var(--theme-text-secondary)',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Box size={16} />
          Themes
        </button>
        <button
          onClick={() => setActiveTab('titlebar')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'titlebar' ? 'var(--theme-surface-active)' : 'transparent',
            color: 'var(--theme-text-secondary)',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <PanelLeft size={16} />
          Titlebar
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'themes' ? (
        <ThemesPage />
      ) : (
        <Card className="settings-section-card" style={{
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
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
            Titlebar Configuration
          </h3>

          {/* Density */}
          <div className="setting-item" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 0',
            borderBottom: '1px solid var(--theme-border-subtle)'
          }}>
            <div className="setting-label">
              <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                Titlebar Density
              </h4>
              <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                Choose between comfortable or compact titlebar height
              </p>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => updateSettings({ titleBarDensity: 'comfortable' })}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--theme-border)',
                  background: settings.titleBarDensity === 'comfortable' ? 'var(--theme-accent-muted)' : 'transparent',
                  color: settings.titleBarDensity === 'comfortable' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Comfortable
              </button>
              <button
                onClick={() => updateSettings({ titleBarDensity: 'compact' })}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--theme-border)',
                  background: settings.titleBarDensity === 'compact' ? 'var(--theme-accent-muted)' : 'transparent',
                  color: settings.titleBarDensity === 'compact' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Compact
              </button>
            </div>
          </div>

          {/* Show App Name */}
          <div className="setting-item" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 0',
            borderBottom: '1px solid var(--theme-border-subtle)'
          }}>
            <div className="setting-label">
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

          {/* Show Chat Title */}
          <div className="setting-item" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 0',
            borderBottom: '1px solid var(--theme-border-subtle)'
          }}>
            <div className="setting-label">
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

          {/* Show Model */}
          <div className="setting-item" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 0'
          }}>
            <div className="setting-label">
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
      )}
    </div>
  )
}

export default AppearanceSection
