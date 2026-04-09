/**
 * SettingsContext - Combined settings context for backward compatibility
 *
 * This module provides a unified settings interface that wraps both:
 * - SettingsUIContext: For frequently changing UI state (theme, title bar, command palette)
 * - SettingsConfigContext: For stable configuration (API keys, models, AI parameters, tools)
 *
 *   values (theme, UI state) and stable values (API keys, model configs)
 *
 * For new code, prefer using the specific hooks:
 * - useSettingsUI() - For theme, title bar, and command palette settings
 * - useSettingsConfig() - For API keys, models, AI parameters, tool settings
 *
 * The combined useSettings() hook is maintained for backward compatibility.
 *
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import {
  SettingsUIProvider,
  useSettingsUI,
  defaultSettingsUI,
  type SettingsUI,
} from './SettingsUIContext'
import {
  SettingsConfigProvider,
  useSettingsConfig,
  defaultSettingsConfig,
  type SettingsConfig,
  type TodoItem,
} from './SettingsConfigContext'
import {
  defaultSettings,
  getInitialConfigSettings,
  getInitialUISettings,
  normalizeStoredSettings,
  parseStoredSettings,
  stripSecretSettings,
  UI_SETTING_KEYS,
  type Settings,
} from './settingsStore'
import { warnOnceDuringHmr } from './hmrWarnings'

// Re-export types for backward compatibility
export type { TodoItem }

function hasSettingsDiff(prev: Settings, updates: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(updates)) {
    const current = (prev as unknown as Record<string, unknown>)[key]
    const bothObjects =
      typeof current === 'object' && current !== null && typeof value === 'object' && value !== null

    if (bothObjects) {
      if (JSON.stringify(current) !== JSON.stringify(value)) {
        return true
      }
      continue
    }

    if (current !== value) {
      return true
    }
  }

  return false
}

interface SettingsContextType {
  settings: Settings
  updateSettings: (newSettings: Partial<Settings>) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

/**
 * Internal component that combines both contexts
 */
function SettingsContextBridge({ children }: { children: React.ReactNode }) {
  const { settingsUI, updateSettingsUI } = useSettingsUI()
  const { settingsConfig, updateSettingsConfig } = useSettingsConfig()

  // Combine settings from both contexts
  const settings = useMemo<Settings>(
    () => ({
      ...settingsUI,
      ...settingsConfig,
    }),
    [settingsUI, settingsConfig]
  )

  // Combined update function that routes to appropriate context
  // React 18+ automatic batching ensures that when both updateSettingsUI and
  // updateSettingsConfig are called within the same event handler, they will
  // be batched into a single render cycle, preventing cascading re-renders.
  const updateSettings = useCallback(
    (newSettings: Partial<Settings>) => {
      // Separate UI settings from config settings
      const uiUpdates: Partial<SettingsUI> = {}
      const configUpdates: Partial<SettingsConfig> = {}

      for (const [key, value] of Object.entries(newSettings)) {
        if (UI_SETTING_KEYS.includes(key as keyof SettingsUI)) {
          ;(uiUpdates as Record<string, unknown>)[key] = value
        } else {
          ;(configUpdates as Record<string, unknown>)[key] = value
        }
      }

      // Update appropriate contexts - React 18+ batches these updates automatically
      // Both context updates will result in a single render cycle
      if (Object.keys(uiUpdates).length > 0) {
        updateSettingsUI(uiUpdates)
      }
      if (Object.keys(configUpdates).length > 0) {
        updateSettingsConfig(configUpdates)
      }
    },
    [updateSettingsUI, updateSettingsConfig]
  )

  // Reset function
  const resetSettings = useCallback(() => {
    updateSettingsUI(defaultSettingsUI)
    updateSettingsConfig(defaultSettingsConfig)
  }, [updateSettingsUI, updateSettingsConfig])

  const contextValue = useMemo(
    () => ({
      settings,
      updateSettings,
      resetSettings,
    }),
    [settings, updateSettings, resetSettings]
  )

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>
}

/**
 * Combined SettingsProvider that wraps both UI and Config providers
 * Maintains backward compatibility with existing code
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Load settings from localStorage
  const [storedSettings] = useState<Settings>(() =>
    normalizeStoredSettings(localStorage.getItem('zura-settings'))
  )

  // Track combined settings for localStorage persistence
  const [combinedSettings, setCombinedSettings] = useState<Settings>(storedSettings)

  // Extract UI and Config settings for child providers
  const initialUISettings = useMemo<Partial<SettingsUI>>(
    () => getInitialUISettings(combinedSettings),
    [combinedSettings]
  )

  const initialConfigSettings = useMemo<Partial<SettingsConfig>>(
    () => getInitialConfigSettings(combinedSettings),
    [combinedSettings]
  )

  // Callbacks to sync settings from child contexts
  const handleUISettingsChange = useCallback((uiSettings: SettingsUI) => {
    setCombinedSettings((prev) => {
      if (!hasSettingsDiff(prev, uiSettings as unknown as Record<string, unknown>)) {
        return prev
      }
      return { ...prev, ...uiSettings }
    })
  }, [])

  const handleConfigSettingsChange = useCallback((configSettings: SettingsConfig) => {
    setCombinedSettings((prev) => {
      if (!hasSettingsDiff(prev, configSettings as unknown as Record<string, unknown>)) {
        return prev
      }
      return { ...prev, ...configSettings }
    })
  }, [])

  // Persist combined settings to localStorage
  useEffect(() => {
    const sanitizedSettings = stripSecretSettings(
      combinedSettings as unknown as Record<string, unknown>
    ) as unknown as Settings
    localStorage.setItem('zura-settings', JSON.stringify(sanitizedSettings))
  }, [combinedSettings])

  // Listen for storage events from other windows/tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'zura-settings') {
        const newSettings = parseStoredSettings(e.newValue)
        setCombinedSettings((prev) => ({ ...prev, ...newSettings }))
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <SettingsUIProvider
      initialSettings={initialUISettings}
      onSettingsChange={handleUISettingsChange}
    >
      <SettingsConfigProvider
        initialSettings={initialConfigSettings}
        onSettingsChange={handleConfigSettingsChange}
      >
        <SettingsContextBridge>{children}</SettingsContextBridge>
      </SettingsConfigProvider>
    </SettingsUIProvider>
  )
}

/**
 * Combined settings hook for backward compatibility
 *
 * For better performance, prefer using the specific hooks:
 * - useSettingsUI() - For theme, title bar, and command palette settings
 * - useSettingsConfig() - For API keys, models, AI parameters, tool settings
 */
export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    // During HMR, the context may temporarily be undefined
    if (import.meta.hot) {
      warnOnceDuringHmr('SettingsContext', '[SettingsContext] Context undefined during HMR, using defaults')
      return {
        settings: defaultSettings,
        updateSettings: () => {},
        resetSettings: () => {},
      }
    }
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

// Re-export the specific hooks for direct use
export { useSettingsUI } from './SettingsUIContext'
export { useSettingsConfig } from './SettingsConfigContext'

// Re-export types
export type { SettingsUI } from './SettingsUIContext'
export type { SettingsConfig } from './SettingsConfigContext'
export type { Settings } from './settingsStore'
export { migrateConfiguredModelCode } from './settingsStore'
