import React, { useState } from 'react'
import { themes, themeCategories, getThemesByCategory } from '../themes/themeRegistry'
import { Theme } from '../themes/themeDefinitions'
import { useTheme } from '../themes/useTheme'
import { useSettings } from '../contexts/SettingsContext'
import ThemePreview from './ThemePreview'
import './ThemesPage.css'

export default function ThemesPage() {
    const { currentTheme, setTheme } = useTheme()
    const { settings, updateSettings } = useSettings()
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)
    
    const filteredThemes = getThemesByCategory(selectedCategory)
    const previewTheme = previewThemeId 
        ? themes[previewThemeId] 
        : currentTheme

    return (
        <div className="themes-page">
            <div className="themes-header">
                <h2>Themes</h2>
                <p className="themes-description">
                    Choose a theme for your interface. Each theme changes the colors and appearance of all UI elements.
                </p>
            </div>

            {/* Personalization */}
            <div className="themes-personalization">
                <h3>Personalization</h3>
                <div className="personalization-card">
                    <div className="personalization-row">
                        <div className="personalization-labels">
                            <div className="personalization-title">Title bar density</div>
                            <div className="personalization-desc">Compact makes more room for chat.</div>
                        </div>
                        <div className="personalization-segmented">
                            <button
                                className={`seg-btn ${settings.titleBarDensity === 'comfortable' ? 'active' : ''}`}
                                onClick={() => updateSettings({ titleBarDensity: 'comfortable' })}
                            >
                                Comfortable
                            </button>
                            <button
                                className={`seg-btn ${settings.titleBarDensity === 'compact' ? 'active' : ''}`}
                                onClick={() => updateSettings({ titleBarDensity: 'compact' })}
                            >
                                Compact
                            </button>
                        </div>
                    </div>

                    <div className="personalization-row">
                        <div className="personalization-labels">
                            <div className="personalization-title">Show in title bar</div>
                            <div className="personalization-desc">Control what appears in the top bar.</div>
                        </div>
                        <div className="personalization-toggles">
                            <label className="personalization-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.titleBarShowAppName}
                                    onChange={(e) => updateSettings({ titleBarShowAppName: e.target.checked })}
                                />
                                <span>App name</span>
                            </label>
                            <label className="personalization-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.titleBarShowChatTitle}
                                    onChange={(e) => updateSettings({ titleBarShowChatTitle: e.target.checked })}
                                />
                                <span>Chat title</span>
                            </label>
                            <label className="personalization-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.titleBarShowModel}
                                    onChange={(e) => updateSettings({ titleBarShowModel: e.target.checked })}
                                />
                                <span>Model</span>
                            </label>
                        </div>
                    </div>

                    <div className="personalization-row">
                        <div className="personalization-labels">
                            <div className="personalization-title">Remember</div>
                            <div className="personalization-desc">Restore your last state when reopening Zura.</div>
                        </div>
                        <div className="personalization-toggles">
                            <label className="personalization-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.rememberLastChatSession}
                                    onChange={(e) => updateSettings({ rememberLastChatSession: e.target.checked })}
                                />
                                <span>Chat session</span>
                            </label>
                            <label className="personalization-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.rememberLastDashboardView}
                                    onChange={(e) => updateSettings({ rememberLastDashboardView: e.target.checked })}
                                />
                                <span>Chat/Settings view</span>
                            </label>
                            <label className="personalization-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.rememberLastSettingsSection}
                                    onChange={(e) => updateSettings({ rememberLastSettingsSection: e.target.checked })}
                                />
                                <span>Settings section</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Category Filter */}
            <div className="theme-categories">
                {themeCategories.map(category => (
                    <button
                        key={category.id}
                        className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(category.id)}
                    >
                        {category.name}
                    </button>
                ))}
            </div>

            {/* Theme Grid */}
            <div className="themes-grid">
                {filteredThemes.map(theme => (
                    <div 
                        key={theme.id}
                        className={`theme-card ${currentTheme.id === theme.id ? 'active' : ''}`}
                        onClick={() => setTheme(theme.id)}
                        onMouseEnter={() => setPreviewThemeId(theme.id)}
                        onMouseLeave={() => setPreviewThemeId(null)}
                    >
                        <div className="theme-color-preview">
                            <div 
                                className="color-swatch"
                                style={{ background: theme.colors.background }}
                            >
                                <div 
                                    className="color-accent"
                                    style={{ background: theme.colors.accent }}
                                ></div>
                            </div>
                            <div className="theme-colors">
                                <div 
                                    className="mini-swatch" 
                                    style={{ background: theme.colors.background }}
                                    title="Background"
                                ></div>
                                <div 
                                    className="mini-swatch" 
                                    style={{ background: theme.colors.surface }}
                                    title="Surface"
                                ></div>
                                <div 
                                    className="mini-swatch" 
                                    style={{ background: theme.colors.accent }}
                                    title="Accent"
                                ></div>
                                <div 
                                    className="mini-swatch" 
                                    style={{ background: theme.colors.textPrimary }}
                                    title="Text"
                                ></div>
                            </div>
                        </div>
                        <div className="theme-info">
                            <h3>{theme.name}</h3>
                            <p>{theme.description}</p>
                            <span className={`theme-badge ${theme.isDark ? 'dark' : 'light'}`}>
                                {theme.isDark ? 'Dark' : 'Light'}
                            </span>
                        </div>
                        {currentTheme.id === theme.id && (
                            <div className="theme-active-indicator">
                                <svg viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Theme Details */}
            <div className="theme-details-section">
                <h3>Theme Details</h3>
                <div className="theme-details-grid">
                    <div className="detail-card">
                        <h4>Background</h4>
                        <div className="detail-color">
                            <div style={{ background: previewTheme.colors.background }}></div>
                            <span>{previewTheme.colors.background}</span>
                        </div>
                    </div>
                    <div className="detail-card">
                        <h4>Surface</h4>
                        <div className="detail-color">
                            <div style={{ background: previewTheme.colors.surface }}></div>
                            <span>{previewTheme.colors.surface}</span>
                        </div>
                    </div>
                    <div className="detail-card">
                        <h4>Accent</h4>
                        <div className="detail-color">
                            <div style={{ background: previewTheme.colors.accent }}></div>
                            <span>{previewTheme.colors.accent}</span>
                        </div>
                    </div>
                    <div className="detail-card">
                        <h4>Text Primary</h4>
                        <div className="detail-color">
                            <div style={{ background: previewTheme.colors.textPrimary }}></div>
                            <span>{previewTheme.colors.textPrimary}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

