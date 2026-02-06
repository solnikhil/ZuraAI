/**
 * SettingsUIContext - Context for frequently changing UI-related settings
 * 
 * This context contains settings that change frequently during user interaction:
 * - Theme settings (theme, activeTheme)
 * - Title bar customization
 * - Command bar settings
 * - Overlay settings
 * 
 * **Validates: Requirements 8.1**
 * - THE SettingsContext SHALL split into separate contexts for frequently-changing 
 *   values (theme, UI state) and stable values (API keys, model configs)
 * 
 * @module SettingsUIContext
 */

import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { getThemeById, getDefaultTheme } from '../themes/themeRegistry'
import { applyThemeToDocument } from '../themes/themeUtils'

export type ChatBubbleStyle = 'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal'

/**
 * UI-related settings that change frequently
 */
export interface SettingsUI {
    // Theme settings
    theme: 'light' | 'dark' | 'system'
    activeTheme: string  // Theme ID for the new theme system
    
    // Title bar personalization
    titleBarDensity: 'comfortable' | 'compact'
    titleBarShowAppName: boolean
    titleBarShowChatTitle: boolean
    titleBarShowModel: boolean
    
    // Overlay settings
    autoHideOverlay: boolean
    overlayTransparency: number
    loadOverlayOnStartup: boolean
    
    // Command bar settings
    commandBar: {
        enabled: boolean
        size: 'small' | 'medium' | 'large'
        fieldSurface: number
        fieldSurfaceFocused: number
        dropdownSurface: number
        enableBlur: boolean
        blurPx: number
        maxSuggestions: number
        showRecents: boolean
        maxRecents: number
        enableTabAutocomplete: boolean
    }
    
    // Frosted sidebar (glassmorphism effect)
    frostedSidebar: boolean

    // Frosted prompt (glassmorphism effect)
    frostedPrompt: boolean

    // Chat bubble style
    chatBubbleStyle?: ChatBubbleStyle
}

/**
 * Default UI settings
 */
export const defaultSettingsUI: SettingsUI = {
    theme: 'dark',
    activeTheme: 'zuraai',
    titleBarDensity: 'compact',
    titleBarShowAppName: true,
    titleBarShowChatTitle: true,
    titleBarShowModel: true,
    autoHideOverlay: false,
    overlayTransparency: 0.95,
    loadOverlayOnStartup: false,
    commandBar: {
        enabled: true,
        size: 'medium',
        fieldSurface: 35,
        fieldSurfaceFocused: 50,
        dropdownSurface: 35,
        enableBlur: true,
        blurPx: 14,
        maxSuggestions: 5,
        showRecents: true,
        maxRecents: 3,
        enableTabAutocomplete: true,
    },
    frostedSidebar: false,
    frostedPrompt: false,
    chatBubbleStyle: 'solid',
}

interface SettingsUIContextType {
    settingsUI: SettingsUI
    updateSettingsUI: (newSettings: Partial<SettingsUI>) => void
}

const SettingsUIContext = createContext<SettingsUIContextType | undefined>(undefined)

interface SettingsUIProviderProps {
    children: React.ReactNode
    /**
     * Initial settings loaded from storage (passed from parent SettingsProvider)
     */
    initialSettings?: Partial<SettingsUI>
    /**
     * Callback when settings change (for syncing with parent SettingsProvider)
     */
    onSettingsChange?: (settings: SettingsUI) => void
}

export function SettingsUIProvider({ 
    children, 
    initialSettings,
    onSettingsChange 
}: SettingsUIProviderProps) {
    const [settingsUI, setSettingsUI] = useState<SettingsUI>(() => {
        return { ...defaultSettingsUI, ...initialSettings }
    })

    // Sync with parent when initialSettings change (e.g., from storage events)
    useEffect(() => {
        if (initialSettings) {
            setSettingsUI(prev => ({ ...prev, ...initialSettings }))
        }
    }, [initialSettings])

    // Apply theme to document
    useLayoutEffect(() => {
        const theme = getThemeById(settingsUI.activeTheme) || getDefaultTheme()
        applyThemeToDocument(theme)

        // Keep native Windows title bar overlay in sync
        if (window.ipcRenderer) {
            const height = settingsUI.titleBarDensity === 'compact' ? 36 : 44
            const overlayColor = settingsUI.frostedSidebar ? '#00000000' : theme.colors.background
            const overlaySymbolColor = settingsUI.frostedSidebar ? '#00000000' : theme.colors.textPrimary
            window.ipcRenderer.send('set-titlebar-overlay', {
                color: overlayColor,
                symbolColor: overlaySymbolColor,
                height,
            })
        }
    }, [settingsUI.activeTheme, settingsUI.titleBarDensity, settingsUI.frostedSidebar])

    // Notify parent of changes
    useEffect(() => {
        onSettingsChange?.(settingsUI)
    }, [settingsUI, onSettingsChange])

    const updateSettingsUI = useCallback((newSettings: Partial<SettingsUI>) => {
        setSettingsUI(prev => ({ ...prev, ...newSettings }))
    }, [])

    const contextValue = useMemo(() => ({
        settingsUI,
        updateSettingsUI,
    }), [settingsUI, updateSettingsUI])

    return (
        <SettingsUIContext.Provider value={contextValue}>
            {children}
        </SettingsUIContext.Provider>
    )
}

/**
 * Hook to access UI-related settings
 * Use this hook when you only need theme, title bar, overlay, or command bar settings
 */
export function useSettingsUI() {
    const context = useContext(SettingsUIContext)
    if (context === undefined) {
        // During HMR, the context may temporarily be undefined
        if (import.meta.hot) {
            console.warn('[SettingsUIContext] Context undefined during HMR, using defaults')
            return {
                settingsUI: defaultSettingsUI,
                updateSettingsUI: () => {},
            }
        }
        throw new Error('useSettingsUI must be used within a SettingsUIProvider')
    }
    return context
}

export { SettingsUIContext }
