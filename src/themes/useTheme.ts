import { useLayoutEffect, useCallback } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { themes, getThemeById, getDefaultTheme } from './themeRegistry'
import { Theme } from './themeDefinitions'
import { applyThemeToDocument } from './themeUtils'

interface UseThemeReturn {
    currentTheme: Theme
    setTheme: (themeId: string) => void
    availableThemes: Theme[]
    toggleDarkMode: () => void
}

export function useTheme(): UseThemeReturn {
    const { settings, updateSettings } = useSettings()
    
    const currentTheme = getThemeById(settings.activeTheme) || getDefaultTheme()
    
    const setTheme = useCallback((themeId: string) => {
        const theme = getThemeById(themeId)
        if (theme) {
            updateSettings({ 
                activeTheme: themeId,
                theme: theme.isDark ? 'dark' : 'light'
            })
        }
    }, [updateSettings])
    
    const toggleDarkMode = useCallback(() => {
        const newIsDark = !currentTheme.isDark
        const newThemeId = 'zuraai'
        setTheme(newThemeId)
    }, [currentTheme.isDark, setTheme])
    
    return {
        currentTheme,
        setTheme,
        availableThemes: Object.values(themes),
        toggleDarkMode
    }
}

// Auto-apply theme on mount
export function useThemeInitializer(): void {
    const { settings } = useSettings()
    
    useLayoutEffect(() => {
        const theme = getThemeById(settings.activeTheme) || getDefaultTheme()
        applyThemeToDocument(theme)
    }, [settings.activeTheme])
}

