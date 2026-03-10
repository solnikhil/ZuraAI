/**
 * SettingsUIContext - Context for frequently changing UI-related settings
 * 
 * This context contains settings that change frequently during user interaction:
 * - Theme settings (theme, activeTheme)
 * - Title bar customization
 * - Command palette settings
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
export type ChatSelectedOverlayStyle = 'linear' | 'notion' | 'slack' | 'discord' | 'github'

/**
 * Model Selector settings
 */
export interface ModelSelectorSettings {
  // Layout
  sidebarPosition: 'left' | 'right'
  sidebarShowLabels: boolean
  sidebarShowModelCount: boolean
  dropdownWidth: 'compact' | 'default' | 'wide'
  
  // Display
  showDescriptions: boolean
  showCapabilityBadges: boolean
  /** How capability badges are shown: icon only, text only, or both */
  capabilityBadgeDisplay: 'icon' | 'text' | 'both'
  showProviderLogos: boolean
  showFavoriteStars: boolean
  showContextLength: boolean
  showInfoTooltips: boolean
  activeIndicatorStyle: 'dot' | 'checkmark' | 'highlight'
  
  // Density
  itemDensity: 'compact' | 'comfortable' | 'spacious'
  
  // Behavior
  defaultView: 'favorites' | 'lastUsed'
  autoCloseOnSelect: boolean
  rememberProvider: boolean
  showSearch: boolean
  
  // Animations
  enableAnimations: boolean
  staggerSpeed: 'fast' | 'normal' | 'slow'
}

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
    
    // Command palette settings
    commandBar: {
        enabled: boolean
        size: 'small' | 'medium' | 'large'
        maxSuggestions: number
        showRecents: boolean
        maxRecents: number
        enableTabAutocomplete: boolean
        overlayOpacity: number                          // range: 0–80
        paletteWidth: 'narrow' | 'default' | 'wide'
        palettePosition: 'top' | 'center' | 'lower'
    }
    
    // Frosted sidebar (glassmorphism effect)
    frostedSidebar: boolean

    // Frosted prompt (glassmorphism effect)
    frostedPrompt: boolean

    // Sidebar auto-hide when window is narrow
    sidebarAutoHideOnResize: boolean

    // Prompt auto-hide (slide away after inactivity)
    promptAutoHide: {
        enabled: boolean
        /** Inactivity timeout in seconds before prompt hides (30–600) */
        timeout: number
    }

    // Softened contrast (reduce harshness of text and surfaces)
    softenedContrast: boolean

    // Chat bubble style
    chatBubbleStyle?: ChatBubbleStyle

    // Sidebar selected chat overlay style
    chatSelectedOverlayStyle?: ChatSelectedOverlayStyle

    // Model Selector settings
    modelSelector?: ModelSelectorSettings
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
    commandBar: {
        enabled: true,
        size: 'medium',
        maxSuggestions: 5,
        showRecents: true,
        maxRecents: 3,
        enableTabAutocomplete: true,
        overlayOpacity: 45,
        paletteWidth: 'default',
        palettePosition: 'center',
    },
    frostedSidebar: false,
    frostedPrompt: false,
    sidebarAutoHideOnResize: true,
    promptAutoHide: {
        enabled: false,
        timeout: 120,
    },
    softenedContrast: false,
    chatBubbleStyle: 'solid',
    chatSelectedOverlayStyle: 'linear',
    modelSelector: {
        sidebarPosition: 'left',
        sidebarShowLabels: true,
        sidebarShowModelCount: true,
        dropdownWidth: 'default',
        showDescriptions: true,
        showCapabilityBadges: true,
        capabilityBadgeDisplay: 'both',
        showProviderLogos: true,
        showFavoriteStars: true,
        showContextLength: true,
        showInfoTooltips: true,
        activeIndicatorStyle: 'dot',
        itemDensity: 'comfortable',
        defaultView: 'lastUsed',
        autoCloseOnSelect: true,
        rememberProvider: true,
        showSearch: true,
        enableAnimations: true,
        staggerSpeed: 'normal',
    },
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
        // Deep merge nested objects so new fields get defaults
        const merged = { ...defaultSettingsUI, ...initialSettings }
        if (initialSettings?.commandBar) {
            merged.commandBar = {
                ...defaultSettingsUI.commandBar,
                ...initialSettings.commandBar,
            }
        }
        if (initialSettings?.modelSelector) {
            merged.modelSelector = {
                ...defaultSettingsUI.modelSelector!,
                ...initialSettings.modelSelector,
            }
        }
        if (initialSettings?.promptAutoHide) {
            merged.promptAutoHide = {
                ...defaultSettingsUI.promptAutoHide,
                ...initialSettings.promptAutoHide,
            }
        }
        return merged
    })

    // Sync with parent when initialSettings change (e.g., from storage events)
    useEffect(() => {
        if (initialSettings) {
            setSettingsUI(prev => {
                const merged = { ...prev, ...initialSettings }
                // Deep merge commandBar so new fields keep defaults
                if (initialSettings.commandBar) {
                    merged.commandBar = {
                        ...defaultSettingsUI.commandBar,
                        ...prev.commandBar,
                        ...initialSettings.commandBar,
                    }
                }
                // Deep merge modelSelector
                if (initialSettings.modelSelector) {
                    merged.modelSelector = {
                        ...defaultSettingsUI.modelSelector!,
                        ...prev.modelSelector,
                        ...initialSettings.modelSelector,
                    }
                }
                // Deep merge promptAutoHide
                if (initialSettings.promptAutoHide) {
                    merged.promptAutoHide = {
                        ...defaultSettingsUI.promptAutoHide,
                        ...prev.promptAutoHide,
                        ...initialSettings.promptAutoHide,
                    }
                }
                return merged
            })
        }
    }, [initialSettings])

    // Apply theme to document
    useLayoutEffect(() => {
        const theme = getThemeById(settingsUI.activeTheme) || getDefaultTheme()
        applyThemeToDocument(theme, { softenedContrast: settingsUI.softenedContrast })
    }, [settingsUI.activeTheme, settingsUI.softenedContrast])

    // Notify parent of changes
    useEffect(() => {
        onSettingsChange?.(settingsUI)
    }, [settingsUI, onSettingsChange])

    const updateSettingsUI = useCallback((newSettings: Partial<SettingsUI>) => {
        setSettingsUI(prev => {
            const merged = { ...prev, ...newSettings }
            // Deep merge modelSelector if present
            if (newSettings.modelSelector) {
                merged.modelSelector = {
                    ...defaultSettingsUI.modelSelector!,
                    ...prev.modelSelector,
                    ...newSettings.modelSelector,
                }
            }
            // Deep merge promptAutoHide if present
            if (newSettings.promptAutoHide) {
                merged.promptAutoHide = {
                    ...defaultSettingsUI.promptAutoHide,
                    ...prev.promptAutoHide,
                    ...newSettings.promptAutoHide,
                }
            }
            return merged
        })
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
 * Use this hook when you only need theme, title bar, or command palette settings
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
