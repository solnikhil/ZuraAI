/**
 * SettingsUIContext - Context for frequently changing UI-related settings
 *
 * This context contains settings that change frequently during user interaction:
 * - Theme settings (theme, activeTheme)
 * - Title bar customization
 * - Command palette settings
 *
 *   values (theme, UI state) and stable values (API keys, model configs)
 *
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react'
import { getThemeById, getDefaultTheme } from '../themes/themeRegistry'
import {
  DEFAULT_FONT_SCALE,
  applyFontScaleToDocument,
  applyThemeToDocument,
} from '../themes/themeUtils'
import { warnOnceDuringHmr } from './hmrWarnings'

export type ChatBubbleStyle = 'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal'
export type ChatSelectedOverlayStyle = 'linear' | 'notion' | 'slack' | 'discord' | 'github'
export type PlaceholderStyle = 'normal' | 'genz'
export type RemindersCardStyle = 'solid' | 'subtle' | 'outline'
export type RemindersContainerStyle = 'panel' | 'flush' | 'framed'
export type RemindersActionStyle = 'pill' | 'soft' | 'minimal'
export type RemindersBadgeStyle = 'soft' | 'filled' | 'outline'

export interface RemindersAppearanceSettings {
  containerStyle: RemindersContainerStyle
  cardStyle: RemindersCardStyle
  actionStyle: RemindersActionStyle
  badgeStyle: RemindersBadgeStyle
  useAccentTint: boolean
}

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
  activeTheme: string // Theme ID for the new theme system
  themeAccent?: string // Custom accent color override
  themeBackground?: string // Custom background color override
  themeForeground?: string // Custom foreground color override
  themeContrast: number // Contrast slider (0-100, 100 = full contrast, lower = softer)
  fontScale: number // Text size scale (85-125, 100 = current default)

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
    overlayOpacity: number // range: 0–80
    paletteWidth: 'narrow' | 'default' | 'wide'
    palettePosition: 'top' | 'center' | 'lower'
  }

  

  // Prompt auto-hide (slide away after inactivity)
  promptAutoHide: {
    enabled: boolean
    /** Inactivity timeout in seconds before prompt hides (30–600) */
    timeout: number
  }

  // Chat bubble style
  chatBubbleStyle?: ChatBubbleStyle

  // Sidebar selected chat overlay style
  chatSelectedOverlayStyle?: ChatSelectedOverlayStyle

  // Empty state placeholder style
  placeholderStyle?: PlaceholderStyle

  // Reminders & Lookouts surface style
  remindersAppearance?: RemindersAppearanceSettings

  // Model Selector settings
  modelSelector?: ModelSelectorSettings
}

/**
 * Default UI settings
 */
export const defaultSettingsUI: SettingsUI = {
  theme: 'dark',
  activeTheme: 'zuraai',
  themeContrast: 100,
  fontScale: DEFAULT_FONT_SCALE,
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
  
  promptAutoHide: {
    enabled: false,
    timeout: 120,
  },
  chatBubbleStyle: 'solid',
  chatSelectedOverlayStyle: 'linear',
  placeholderStyle: 'genz',
  remindersAppearance: {
    containerStyle: 'flush',
    cardStyle: 'solid',
    actionStyle: 'pill',
    badgeStyle: 'soft',
    useAccentTint: true,
  },
  modelSelector: {
    sidebarPosition: 'left',
    sidebarShowLabels: false,
    sidebarShowModelCount: false,
    dropdownWidth: 'default',
    showDescriptions: false,
    showCapabilityBadges: false,
    capabilityBadgeDisplay: 'both',
    showProviderLogos: true,
    showFavoriteStars: false,
    showContextLength: true,
    showInfoTooltips: true,
    activeIndicatorStyle: 'dot',
    itemDensity: 'compact',
    defaultView: 'lastUsed',
    autoCloseOnSelect: true,
    rememberProvider: true,
    showSearch: true,
    enableAnimations: true,
    staggerSpeed: 'normal',
  },
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
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
  onSettingsChange,
}: SettingsUIProviderProps) {
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)
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
    if (initialSettings?.remindersAppearance) {
      merged.remindersAppearance = {
        ...defaultSettingsUI.remindersAppearance!,
        ...initialSettings.remindersAppearance,
      }
    }
    return merged
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }

    setSystemPrefersDark(media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  // Sync with parent when initialSettings change (e.g., from storage events)
  useEffect(() => {
    if (initialSettings) {
      setSettingsUI((prev) => {
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
        if (initialSettings.remindersAppearance) {
          merged.remindersAppearance = {
            ...defaultSettingsUI.remindersAppearance!,
            ...prev.remindersAppearance,
            ...initialSettings.remindersAppearance,
          }
        }
        return merged
      })
    }
  }, [initialSettings])

  // Apply theme to document
  useLayoutEffect(() => {
    const effectiveThemeId =
      settingsUI.theme === 'system'
        ? systemPrefersDark
          ? 'zuraai'
          : 'zuraai-light'
        : settingsUI.activeTheme
    const theme = getThemeById(effectiveThemeId) || getDefaultTheme()
    const customAccent = settingsUI.themeAccent
    const customBackground = settingsUI.themeBackground
    const customForeground = settingsUI.themeForeground
    const contrast = settingsUI.themeContrast
    
    applyThemeToDocument(theme, {
      customAccent,
      customBackground,
      customForeground,
      contrast: contrast < 100 ? contrast : undefined,
    })
    applyFontScaleToDocument(settingsUI.fontScale)

    const root = document.documentElement
    const remindersAppearance = {
      ...defaultSettingsUI.remindersAppearance!,
      ...settingsUI.remindersAppearance,
    }
    root.dataset.remindersCard = remindersAppearance.cardStyle
    root.dataset.remindersContainer = remindersAppearance.containerStyle
    root.dataset.remindersAction = remindersAppearance.actionStyle
    root.dataset.remindersBadge = remindersAppearance.badgeStyle
    root.dataset.remindersAccentTint = remindersAppearance.useAccentTint ? 'on' : 'off'
  }, [
    settingsUI.theme,
    settingsUI.activeTheme,
    settingsUI.themeAccent,
    settingsUI.themeBackground,
    settingsUI.themeForeground,
    settingsUI.themeContrast,
    settingsUI.fontScale,
    settingsUI.remindersAppearance,
    systemPrefersDark,
  ])

  // Notify parent of changes
  useEffect(() => {
    onSettingsChange?.(settingsUI)
  }, [settingsUI, onSettingsChange])

  const updateSettingsUI = useCallback((newSettings: Partial<SettingsUI>) => {
    setSettingsUI((prev) => {
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
      // Deep merge remindersAppearance if present
      if (newSettings.remindersAppearance) {
        merged.remindersAppearance = {
          ...defaultSettingsUI.remindersAppearance!,
          ...prev.remindersAppearance,
          ...newSettings.remindersAppearance,
        }
      }
      return merged
    })
  }, [])

  const contextValue = useMemo(
    () => ({
      settingsUI,
      updateSettingsUI,
    }),
    [settingsUI, updateSettingsUI]
  )

  return <SettingsUIContext.Provider value={contextValue}>{children}</SettingsUIContext.Provider>
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
      warnOnceDuringHmr('SettingsUIContext', '[SettingsUIContext] Context undefined during HMR, using defaults')
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
