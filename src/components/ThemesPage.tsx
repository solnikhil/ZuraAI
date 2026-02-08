import React, { useState } from 'react'
import { themes, themeCategories, getThemesByCategory } from '../themes/themeRegistry'
import { Theme } from '../themes/themeDefinitions'
import { useTheme } from '../themes/useTheme'
import { useSettings } from '../contexts/SettingsContext'
import ThemePreview from './ThemePreview'
import { Card } from '@/components/ui/card'
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
        <div style={{ padding: '32px', paddingBottom: 100 }}>
            <div className="page-header">
                <h2 className="page-title">Themes</h2>
                <div className="page-subtitle">
                    Choose a theme for your interface. Each theme changes the colors and appearance of all UI elements.
                </div>
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
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
            <div className="themes-grid" style={{ marginTop: 24 }}>
                {filteredThemes.map(theme => (
                    <div
                        key={theme.id}
                        className={`theme-card ${currentTheme.id === theme.id ? 'active' : ''}`}
                        onClick={() => setTheme(theme.id)}
                        onMouseEnter={() => setPreviewThemeId(theme.id)}
                        onMouseLeave={() => setPreviewThemeId(null)}
                    >
                        <div className="theme-card-overlay" />
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
            <Card className="settings-section-card" style={{ marginTop: 24 }}>
                <h3 className="section-head">Theme Details</h3>
                <div className="theme-details-grid" style={{ marginTop: 16 }}>
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
            </Card>
        </div>
    )
}

