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
import { getAllToolDefinitions } from '../tools/definitions'
import { migrateSkillsFromLegacySettings } from '../skills'
import { getProviderDefinitions } from '../providers'

// Re-export types for backward compatibility
export type { TodoItem }

/**
 * Combined Settings interface (union of SettingsUI and SettingsConfig)
 * Maintained for backward compatibility
 */
export interface Settings extends SettingsUI, SettingsConfig {}

const defaultSettings: Settings = {
  ...defaultSettingsUI,
  ...defaultSettingsConfig,
}

const SECRET_SETTING_KEYS: Array<
  keyof Pick<
    Settings,
    'openRouterApiKey' | 'perplexityApiKey' | 'groqApiKey' | 'tavilyApiKey' | 'alibabaApiKey' | 'fireworksApiKey'
  >
> = ['openRouterApiKey', 'perplexityApiKey', 'groqApiKey', 'tavilyApiKey', 'alibabaApiKey', 'fireworksApiKey']

const ALL_PROVIDER_IDS = getProviderDefinitions({ includeLegacy: true }).map((provider) => provider.id)
const ACTIVE_PROVIDER_IDS = getProviderDefinitions({ includeLegacy: false }).map((provider) => provider.id)
const LEGACY_FIREWORKS_MODEL_ID_MAP: Record<string, string> = {
  'accounts/fireworks/models/kimi-k2p5-turbo': 'accounts/fireworks/routers/kimi-k2p5-turbo',
  'accounts/fireworks/models/kimi-k2p5-turbo-instruct': 'accounts/fireworks/routers/kimi-k2p5-turbo',
}

function stripSecretSettings<T extends Record<string, unknown>>(raw: T): T {
  const sanitized = { ...raw }
  for (const key of SECRET_SETTING_KEYS) {
    delete sanitized[key]
  }
  return sanitized
}

export function migrateConfiguredModelCode<
  T extends {
    code: string
    displayName?: string
  },
>(model: T): T {
  const mappedCode = LEGACY_FIREWORKS_MODEL_ID_MAP[model.code]
  if (!mappedCode) return model

  return {
    ...model,
    code: mappedCode,
    displayName:
      model.displayName === 'Kimi K2.5 Turbo'
        ? 'Kimi K2.5 Turbo'
        : model.displayName,
  }
}

function parseStoredSettings(raw: string | null): Partial<Settings> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
      return {}
    }
    return stripSecretSettings(parsed as Partial<Settings>)
  } catch {
    console.warn(
      '[SettingsContext] Invalid zura-settings in localStorage. Falling back to defaults.'
    )
    return {}
  }
}

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
      const uiKeys: (keyof SettingsUI)[] = [
        'theme',
        'activeTheme',
        'themeAccent',
        'themeBackground',
        'themeForeground',
        'themeContrast',
        'titleBarDensity',
        'titleBarShowAppName',
        'titleBarShowChatTitle',
        'titleBarShowModel',
        'commandBar',
        'frostedPrompt',
        'sidebarAutoHideOnResize',
        'chatBubbleStyle',
        'chatSelectedOverlayStyle',
        'modelSelector',
        'promptAutoHide',
      ]

      const uiUpdates: Partial<SettingsUI> = {}
      const configUpdates: Partial<SettingsConfig> = {}

      for (const [key, value] of Object.entries(newSettings)) {
        if (uiKeys.includes(key as keyof SettingsUI)) {
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
  const [storedSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('zura-settings')
    const parsedFromStorage = parseStoredSettings(saved)
    const parsed = { ...defaultSettings, ...parsedFromStorage }

    // Remove deprecated overlay-era settings from older persisted state
    delete (parsed as Record<string, unknown>).autoHideOverlay
    delete (parsed as Record<string, unknown>).overlayTransparency
    delete (parsed as Record<string, unknown>).loadOverlayOnStartup
    delete (parsed as Record<string, unknown>).shortcuts

    // Force migration: if model is the old default, switch to Grok
    if (parsed.aiModel === 'openrouter/sherlock-dash-alpha') {
      parsed.aiModel = 'x-ai/grok-4.1-fast'
    }

    // Force migration: System Prompt update for better formatting
    if (parsed.systemPrompt?.includes('Keep responses concise and actionable')) {
      parsed.systemPrompt = defaultSettings.systemPrompt
    }
    // Migrate truncated or outdated defaults (e.g. old ~800 char truncation, or "You are Zura" variant)
    const defaultLen = defaultSettings.systemPrompt.length
    if (
      typeof parsed.systemPrompt === 'string' &&
      (parsed.systemPrompt.includes('You are Zura') ||
        (parsed.systemPrompt.startsWith('Role & Identity') &&
          parsed.systemPrompt.length < defaultLen - 10))
    ) {
      parsed.systemPrompt = defaultSettings.systemPrompt
    }
    if (parsed.webSearchPrompt === undefined)
      parsed.webSearchPrompt = defaultSettings.webSearchPrompt

    // Initialize new fields if missing
    if (!parsed.modelProvider) parsed.modelProvider = defaultSettings.modelProvider
    // Migrate unknown providers to openrouter
    if (!ALL_PROVIDER_IDS.includes(parsed.modelProvider as typeof ALL_PROVIDER_IDS[number])) {
      parsed.modelProvider = 'openrouter'
    }
    parsed.providerEnabled = {
      ...defaultSettings.providerEnabled,
      ...(typeof parsed.providerEnabled === 'object' && parsed.providerEnabled !== null
        ? parsed.providerEnabled
        : {}),
    }
    if (!parsed.ollamaUrl) parsed.ollamaUrl = defaultSettings.ollamaUrl
    if (!parsed.ollamaModels) parsed.ollamaModels = defaultSettings.ollamaModels
    if (!parsed.perplexityApiKey) parsed.perplexityApiKey = defaultSettings.perplexityApiKey
    if (!parsed.perplexityModels) parsed.perplexityModels = defaultSettings.perplexityModels
    else {
      // Merge: use default list, preserve user's enabled and maxContext from defaults for models that exist in both
      const merged = defaultSettings.perplexityModels.map((d) => {
        const existing = parsed.perplexityModels.find((m: { code: string }) => m.code === d.code)
        return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
      })
      parsed.perplexityModels = merged
    }
    // Initialize Groq fields if missing
    if (!parsed.groqApiKey) parsed.groqApiKey = defaultSettings.groqApiKey
    if (!parsed.groqModels) parsed.groqModels = defaultSettings.groqModels
    else {
      // Merge: use new default list, preserve user's enabled state for models that exist in both
      const merged = defaultSettings.groqModels.map((d) => {
        const existing = parsed.groqModels.find((m: { code: string }) => m.code === d.code)
        return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
      })
      parsed.groqModels = merged
    }
    // Initialize Alibaba fields if missing
    if (!parsed.alibabaApiKey) parsed.alibabaApiKey = defaultSettings.alibabaApiKey
    // Always merge with full default list (expanded model catalog); preserve user's enabled state
    const userAlibaba = parsed.alibabaModels
    const mergedAlibaba = defaultSettings.alibabaModels.map((d) => {
      const existing = Array.isArray(userAlibaba)
        ? userAlibaba.find((m: { code: string }) => m.code === d.code)
        : undefined
      return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
    })
    // Append any user-added custom models not in defaults
    const defaultCodes = new Set(defaultSettings.alibabaModels.map((d) => d.code))
    const customModels = Array.isArray(userAlibaba)
      ? userAlibaba.filter((m: { code: string }) => !defaultCodes.has(m.code))
      : []
    parsed.alibabaModels = [...mergedAlibaba, ...customModels]
    // Initialize Fireworks fields if missing
    if (!parsed.fireworksApiKey) parsed.fireworksApiKey = defaultSettings.fireworksApiKey
    if (parsed.aiModel && LEGACY_FIREWORKS_MODEL_ID_MAP[parsed.aiModel]) {
      parsed.aiModel = LEGACY_FIREWORKS_MODEL_ID_MAP[parsed.aiModel]
    }
    // Always merge with full default list; preserve user's enabled state
    const userFireworks = Array.isArray(parsed.fireworksModels)
      ? parsed.fireworksModels.map((model) => migrateConfiguredModelCode(model))
      : parsed.fireworksModels
    const mergedFireworks = defaultSettings.fireworksModels.map((d) => {
      const existing = Array.isArray(userFireworks)
        ? userFireworks.find((m: { code: string }) => m.code === d.code)
        : undefined
      return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
    })
    // Append any user-added custom models not in defaults
    const defaultFireworksCodes = new Set(defaultSettings.fireworksModels.map((d) => d.code))
    const customFireworksModels = Array.isArray(userFireworks)
      ? userFireworks.filter((m: { code: string }) => !defaultFireworksCodes.has(m.code))
      : []
    parsed.fireworksModels = [...mergedFireworks, ...customFireworksModels]
    // Migrate deprecated Groq model IDs when modelProvider is groq
    const deprecatedGroqModelMap: Record<string, string> = {
      'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
      'deepseek-r1-distill-llama-70b': 'llama-3.3-70b-versatile',
      'mixtral-8x7b-32768': 'llama-3.1-8b-instant',
      'gemma2-9b-it': 'llama-3.1-8b-instant',
    }
    if (
      parsed.modelProvider === 'groq' &&
      parsed.aiModel &&
      deprecatedGroqModelMap[parsed.aiModel]
    ) {
      parsed.aiModel = deprecatedGroqModelMap[parsed.aiModel]
    }
    // Ensure titleModel exists; migrate gemini-* to OpenRouter model
    if (!parsed.titleModelProvider) parsed.titleModelProvider = defaultSettings.titleModelProvider
    if (!ACTIVE_PROVIDER_IDS.includes(parsed.titleModelProvider as typeof ACTIVE_PROVIDER_IDS[number])) {
      parsed.titleModelProvider = defaultSettings.titleModelProvider
    }
    // titleModel can be empty (resolved dynamically at runtime)
    if (parsed.titleModel === undefined || parsed.titleModel === null) {
      parsed.titleModel = defaultSettings.titleModel
    }
    // Migrate deprecated gemini-* prefix to empty (will be resolved dynamically)
    if (parsed.titleModel?.startsWith('gemini-')) {
      parsed.titleModel = ''
    }
    if (parsed.titleModel === 'google/gemini-2.0-flash-exp:free') {
      parsed.titleModel = ''
    }
    if (typeof parsed.titleGenerationPrompt !== 'string') {
      parsed.titleGenerationPrompt = defaultSettings.titleGenerationPrompt
    }
    if (
      !parsed.titleGenerationDisplayMode ||
      !['instant', 'typewriter'].includes(parsed.titleGenerationDisplayMode)
    ) {
      parsed.titleGenerationDisplayMode = defaultSettings.titleGenerationDisplayMode
    }

    // Max tokens sanity + migration
    if (
      typeof parsed.maxTokens !== 'number' ||
      !Number.isFinite(parsed.maxTokens) ||
      parsed.maxTokens <= 0
    ) {
      parsed.maxTokens = defaultSettings.maxTokens
    }
    if (
      parsed.modelProvider === 'openrouter' &&
      typeof parsed.aiModel === 'string' &&
      /:free\b/.test(parsed.aiModel) &&
      parsed.maxTokens <= 1000
    ) {
      parsed.maxTokens = 8000
    }
    // Initialize todos if missing
    if (!parsed.todos) parsed.todos = []
    // Initialize tool settings if missing
    if (parsed.toolsEnabled === undefined) parsed.toolsEnabled = defaultSettings.toolsEnabled
    if (!parsed.tavilyApiKey) parsed.tavilyApiKey = defaultSettings.tavilyApiKey
    if (
      parsed.tavilySearchDepthPreference !== 'auto' &&
      parsed.tavilySearchDepthPreference !== 'ultra-fast' &&
      parsed.tavilySearchDepthPreference !== 'fast' &&
      parsed.tavilySearchDepthPreference !== 'basic' &&
      parsed.tavilySearchDepthPreference !== 'advanced'
    ) {
      parsed.tavilySearchDepthPreference = defaultSettings.tavilySearchDepthPreference
    }
    if (typeof parsed.webSearchIncludeImages !== 'boolean') {
      parsed.webSearchIncludeImages = defaultSettings.webSearchIncludeImages
    }
    const availableToolNames = new Set(getAllToolDefinitions().map((tool) => tool.name))
    if (!Array.isArray(parsed.enabledTools) || parsed.enabledTools.length === 0) {
      parsed.enabledTools = defaultSettings.enabledTools
    } else {
      parsed.enabledTools = parsed.enabledTools.filter((tool: string) =>
        availableToolNames.has(tool)
      )
      if (parsed.enabledTools.length === 0) {
        parsed.enabledTools = defaultSettings.enabledTools
      }
    }
    const legacySettingsRecord = parsed as Record<string, unknown>
    parsed.skills = migrateSkillsFromLegacySettings({
      skills: legacySettingsRecord.skills,
      webSearchEnabled: legacySettingsRecord.webSearchEnabled,
      structuredResearchEnabled: legacySettingsRecord.structuredResearchEnabled,
      deepResearchEnabled: legacySettingsRecord.deepResearchEnabled,
    })
    delete legacySettingsRecord.deepResearchEnabled
    delete legacySettingsRecord.webSearchEnabled
    delete legacySettingsRecord.structuredResearchEnabled
    // Initialize favoriteModels if missing
    if (!parsed.favoriteModels) parsed.favoriteModels = defaultSettings.favoriteModels

    // Title bar personalization - always use compact (narrow) mode
    parsed.titleBarDensity = 'compact'
    if (parsed.titleBarShowAppName === undefined)
      parsed.titleBarShowAppName = defaultSettings.titleBarShowAppName
    if (parsed.titleBarShowChatTitle === undefined)
      parsed.titleBarShowChatTitle = defaultSettings.titleBarShowChatTitle
    if (parsed.titleBarShowModel === undefined)
      parsed.titleBarShowModel = defaultSettings.titleBarShowModel
    if (parsed.rememberLastChatSession === undefined)
      parsed.rememberLastChatSession = defaultSettings.rememberLastChatSession
    if (parsed.rememberLastSettingsSection === undefined)
      parsed.rememberLastSettingsSection = defaultSettings.rememberLastSettingsSection
    if (parsed.rememberLastDashboardView === undefined)
      parsed.rememberLastDashboardView = defaultSettings.rememberLastDashboardView
    // Initialize commandBar settings if missing; deep-merge with defaults
    // so that new fields (overlayOpacity, paletteWidth, palettePosition)
    // get their default values when upgrading from older persisted data
    if (!parsed.commandBar) {
      parsed.commandBar = defaultSettings.commandBar
    } else {
      parsed.commandBar = { ...defaultSettings.commandBar, ...parsed.commandBar }
    }

    // Initialize configuredModels if missing or empty
    if (!parsed.configuredModels || parsed.configuredModels.length === 0) {
      parsed.configuredModels = defaultSettings.configuredModels
    }
    // Initialize activeTheme if missing (new theme system)
    if (!parsed.activeTheme) parsed.activeTheme = defaultSettings.activeTheme
    // Ignore legacy frostedSidebar values from older builds.
    delete (parsed as Record<string, unknown>).frostedSidebar
    // Initialize frostedPrompt if missing (glassmorphism effect)
    if (parsed.frostedPrompt === undefined) parsed.frostedPrompt = defaultSettings.frostedPrompt
    // Initialize sidebarAutoHideOnResize if missing
    if (parsed.sidebarAutoHideOnResize === undefined)
      parsed.sidebarAutoHideOnResize = defaultSettings.sidebarAutoHideOnResize
    // Initialize promptAutoHide if missing; deep-merge with defaults
    if (!parsed.promptAutoHide) {
      parsed.promptAutoHide = defaultSettings.promptAutoHide
    } else {
      parsed.promptAutoHide = { ...defaultSettings.promptAutoHide, ...parsed.promptAutoHide }
    }
    // Migrate softenedContrast (deprecated boolean) to themeContrast (0-100)
    // If user had softenedContrast: true, migrate to themeContrast: 85 (softer)
    // Otherwise default to 100 (full contrast)
    if (parsed.themeContrast === undefined) {
      if (parsed.softenedContrast === true) {
        parsed.themeContrast = 85
      } else {
        parsed.themeContrast = 100
      }
    }
    // Remove deprecated softenedContrast from persisted state
    delete (parsed as Record<string, unknown>).softenedContrast
    // Remove deprecated notification settings from persisted payloads
    delete (parsed as Record<string, unknown>).notificationsEnabled
    delete (parsed as Record<string, unknown>).nativeNotificationsEnabled
    delete (parsed as Record<string, unknown>).toastDuration
    delete (parsed as Record<string, unknown>).doNotDisturb
    // Initialize chatBubbleStyle if missing
    if (!parsed.chatBubbleStyle) parsed.chatBubbleStyle = defaultSettings.chatBubbleStyle
    // Initialize/migrate chatSelectedOverlayStyle if missing
    const legacyChatSelectedOverlayMap: Partial<
      Record<string, NonNullable<SettingsUI['chatSelectedOverlayStyle']>>
    > = {
      pill: 'linear',
      soft: 'notion',
      outline: 'github',
      glow: 'slack',
    }
    const rawChatSelectedOverlayStyle = parsed.chatSelectedOverlayStyle as string | undefined
    if (!rawChatSelectedOverlayStyle) {
      parsed.chatSelectedOverlayStyle = defaultSettings.chatSelectedOverlayStyle
    } else {
      const migratedStyle = legacyChatSelectedOverlayMap[rawChatSelectedOverlayStyle]
      if (migratedStyle) {
        parsed.chatSelectedOverlayStyle = migratedStyle
      } else if (
        !['linear', 'notion', 'slack', 'discord', 'github'].includes(rawChatSelectedOverlayStyle)
      ) {
        parsed.chatSelectedOverlayStyle = defaultSettings.chatSelectedOverlayStyle
      }
    }

    // Remove deprecated response transition mode from persisted payloads
    delete (parsed as Record<string, unknown>).responseTransitionMode

    return parsed
  })

  // Track combined settings for localStorage persistence
  const [combinedSettings, setCombinedSettings] = useState<Settings>(storedSettings)

  // Extract UI and Config settings for child providers
  const initialUISettings = useMemo<Partial<SettingsUI>>(
    () => ({
      theme: combinedSettings.theme,
      activeTheme: combinedSettings.activeTheme,
      themeAccent: combinedSettings.themeAccent,
      themeBackground: combinedSettings.themeBackground,
      themeForeground: combinedSettings.themeForeground,
      themeContrast: combinedSettings.themeContrast,
      titleBarDensity: combinedSettings.titleBarDensity,
      titleBarShowAppName: combinedSettings.titleBarShowAppName,
      titleBarShowChatTitle: combinedSettings.titleBarShowChatTitle,
      titleBarShowModel: combinedSettings.titleBarShowModel,
      commandBar: combinedSettings.commandBar,
      frostedPrompt: combinedSettings.frostedPrompt,
      sidebarAutoHideOnResize: combinedSettings.sidebarAutoHideOnResize,
      promptAutoHide: combinedSettings.promptAutoHide,
      chatBubbleStyle: combinedSettings.chatBubbleStyle,
      chatSelectedOverlayStyle: combinedSettings.chatSelectedOverlayStyle,
      modelSelector: combinedSettings.modelSelector,
    }),
    [combinedSettings]
  )

  const initialConfigSettings = useMemo<Partial<SettingsConfig>>(
    () => ({
      openRouterApiKey: combinedSettings.openRouterApiKey,
      perplexityApiKey: combinedSettings.perplexityApiKey,
      groqApiKey: combinedSettings.groqApiKey,
      tavilyApiKey: combinedSettings.tavilyApiKey,
      tavilySearchDepthPreference: combinedSettings.tavilySearchDepthPreference,
      webSearchIncludeImages: combinedSettings.webSearchIncludeImages,
      alibabaApiKey: combinedSettings.alibabaApiKey,
      fireworksApiKey: combinedSettings.fireworksApiKey,
      aiModel: combinedSettings.aiModel,
      modelProvider: combinedSettings.modelProvider,
      providerEnabled: combinedSettings.providerEnabled,
      configuredModels: combinedSettings.configuredModels,
      ollamaUrl: combinedSettings.ollamaUrl,
      ollamaModels: combinedSettings.ollamaModels,
      perplexityModels: combinedSettings.perplexityModels,
      groqModels: combinedSettings.groqModels,
      alibabaModels: combinedSettings.alibabaModels,
      fireworksModels: combinedSettings.fireworksModels,
      temperature: combinedSettings.temperature,
      maxTokens: combinedSettings.maxTokens,
      systemPrompt: combinedSettings.systemPrompt,
      webSearchPrompt: combinedSettings.webSearchPrompt,
      streamResponses: combinedSettings.streamResponses,
      toolsEnabled: combinedSettings.toolsEnabled,
      enabledTools: combinedSettings.enabledTools,
      skills: combinedSettings.skills,
      titleModel: combinedSettings.titleModel,
      titleModelProvider: combinedSettings.titleModelProvider,
      titleGenerationPrompt: combinedSettings.titleGenerationPrompt,
      titleGenerationDisplayMode: combinedSettings.titleGenerationDisplayMode,
      favoriteModels: combinedSettings.favoriteModels,
      quickPrompts: combinedSettings.quickPrompts,
      todos: combinedSettings.todos,
      rememberLastChatSession: combinedSettings.rememberLastChatSession,
      rememberLastSettingsSection: combinedSettings.rememberLastSettingsSection,
      rememberLastDashboardView: combinedSettings.rememberLastDashboardView,
    }),
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
      console.warn('[SettingsContext] Context undefined during HMR, using defaults')
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
