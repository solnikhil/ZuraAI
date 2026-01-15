/**
 * AppearanceSection component for Settings
 * Wraps ThemesPage for theme customization
 *
 * @module AppearanceSection
 * Requirements: 2.4
 */

import React, { useLayoutEffect, useState } from 'react'
import { PanelLeft, Box } from '../../icons'
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
        <div className="settings-section-card" style={{
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
            <label className="toggle-switch" style={{
              width: '48px',
              height: '26px',
              background: settings.titleBarShowAppName ? 'var(--theme-accent)' : 'var(--theme-background)',
              borderRadius: '13px',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: '1px solid var(--theme-border)',
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              <input
                type="checkbox"
                checked={settings.titleBarShowAppName}
                onChange={(e) => updateSettings({ titleBarShowAppName: e.target.checked })}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, cursor: 'pointer' }}
              />
              <span className="toggle-slider" style={{
                width: '20px',
                height: '20px',
                background: 'var(--theme-text-primary)',
                borderRadius: '50%',
                position: 'absolute',
                top: '50%',
                left: '3px',
                transform: `translateY(-50%) ${settings.titleBarShowAppName ? 'translateX(22px)' : ''}`,
                transition: 'all 0.3s',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                pointerEvents: 'none'
              }} />
            </label>
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
            <label className="toggle-switch" style={{
              width: '48px',
              height: '26px',
              background: settings.titleBarShowChatTitle ? 'var(--theme-accent)' : 'var(--theme-background)',
              borderRadius: '13px',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: '1px solid var(--theme-border)',
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              <input
                type="checkbox"
                checked={settings.titleBarShowChatTitle}
                onChange={(e) => updateSettings({ titleBarShowChatTitle: e.target.checked })}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, cursor: 'pointer' }}
              />
              <span className="toggle-slider" style={{
                width: '20px',
                height: '20px',
                background: 'var(--theme-text-primary)',
                borderRadius: '50%',
                position: 'absolute',
                top: '50%',
                left: '3px',
                transform: `translateY(-50%) ${settings.titleBarShowChatTitle ? 'translateX(22px)' : ''}`,
                transition: 'all 0.3s',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                pointerEvents: 'none'
              }} />
            </label>
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
            <label className="toggle-switch" style={{
              width: '48px',
              height: '26px',
              background: settings.titleBarShowModel ? 'var(--theme-accent)' : 'var(--theme-background)',
              borderRadius: '13px',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: '1px solid var(--theme-border)',
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              <input
                type="checkbox"
                checked={settings.titleBarShowModel}
                onChange={(e) => updateSettings({ titleBarShowModel: e.target.checked })}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, cursor: 'pointer' }}
              />
              <span className="toggle-slider" style={{
                width: '20px',
                height: '20px',
                background: 'var(--theme-text-primary)',
                borderRadius: '50%',
                position: 'absolute',
                top: '50%',
                left: '3px',
                transform: `translateY(-50%) ${settings.titleBarShowModel ? 'translateX(22px)' : ''}`,
                transition: 'all 0.3s',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                pointerEvents: 'none'
              }} />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppearanceSection
