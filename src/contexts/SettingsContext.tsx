/**
 * SettingsContext - Combined settings context for backward compatibility
 * 
 * This module provides a unified settings interface that wraps both:
 * - SettingsUIContext: For frequently changing UI state (theme, title bar, command bar)
 * - SettingsConfigContext: For stable configuration (API keys, models, AI parameters, tools)
 * 
 * **Validates: Requirements 8.1**
 * - THE SettingsContext SHALL split into separate contexts for frequently-changing 
 *   values (theme, UI state) and stable values (API keys, model configs)
 * 
 * For new code, prefer using the specific hooks:
 * - useSettingsUI() - For theme, title bar, and command bar settings
 * - useSettingsConfig() - For API keys, models, AI parameters, tool settings
 * 
 * The combined useSettings() hook is maintained for backward compatibility.
 * 
 * @module SettingsContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { SettingsUIProvider, useSettingsUI, defaultSettingsUI, type SettingsUI } from './SettingsUIContext'
import { SettingsConfigProvider, useSettingsConfig, defaultSettingsConfig, type SettingsConfig, type TodoItem } from './SettingsConfigContext'

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
    const settings = useMemo<Settings>(() => ({
        ...settingsUI,
        ...settingsConfig,
    }), [settingsUI, settingsConfig])

    // Combined update function that routes to appropriate context
    // **Validates: Requirements 8.5, Property 32: Batched Context Updates**
    // React 18+ automatic batching ensures that when both updateSettingsUI and
    // updateSettingsConfig are called within the same event handler, they will
    // be batched into a single render cycle, preventing cascading re-renders.
    const updateSettings = useCallback((newSettings: Partial<Settings>) => {
        // Separate UI settings from config settings
        const uiKeys: (keyof SettingsUI)[] = [
            'theme', 'activeTheme',
            'titleBarDensity', 'titleBarShowAppName', 'titleBarShowChatTitle', 'titleBarShowModel',
            'commandBar', 'frostedSidebar', 'frostedPrompt', 'sidebarAutoHideOnResize', 'softenedContrast', 'chatBubbleStyle', 'chatSelectedOverlayStyle',
            'modelSelector'
        ]
        
        const uiUpdates: Partial<SettingsUI> = {}
        const configUpdates: Partial<SettingsConfig> = {}
        
        for (const [key, value] of Object.entries(newSettings)) {
            if (uiKeys.includes(key as keyof SettingsUI)) {
                (uiUpdates as Record<string, unknown>)[key] = value
            } else {
                (configUpdates as Record<string, unknown>)[key] = value
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
    }, [updateSettingsUI, updateSettingsConfig])

    // Reset function
    const resetSettings = useCallback(() => {
        updateSettingsUI(defaultSettingsUI)
        updateSettingsConfig(defaultSettingsConfig)
    }, [updateSettingsUI, updateSettingsConfig])

    const contextValue = useMemo(() => ({
        settings,
        updateSettings,
        resetSettings,
    }), [settings, updateSettings, resetSettings])

    return (
        <SettingsContext.Provider value={contextValue}>
            {children}
        </SettingsContext.Provider>
    )
}

/**
 * Combined SettingsProvider that wraps both UI and Config providers
 * Maintains backward compatibility with existing code
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
    // Load settings from localStorage
    const [storedSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('zura-settings')
        const parsed = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings

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
                (parsed.systemPrompt.startsWith('Role & Identity') && parsed.systemPrompt.length < defaultLen - 10))
        ) {
            parsed.systemPrompt = defaultSettings.systemPrompt
        }
        if (parsed.webSearchPrompt === undefined) parsed.webSearchPrompt = defaultSettings.webSearchPrompt

        // Initialize new fields if missing
        if (!parsed.modelProvider) parsed.modelProvider = defaultSettings.modelProvider
        // Migrate removed providers to openrouter
        if (parsed.modelProvider === 'gemini' || parsed.modelProvider === 'minimax') {
            parsed.modelProvider = 'openrouter'
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
        // Initialize NVIDIA fields if missing
        if (!parsed.nvidiaApiKey) parsed.nvidiaApiKey = defaultSettings.nvidiaApiKey
        // Always use full default list; merge preserves user's enabled state for models that exist in both
        const userNvidia = parsed.nvidiaModels
        const merged = defaultSettings.nvidiaModels.map((d) => {
            const existing = Array.isArray(userNvidia) ? userNvidia.find((m: { code: string }) => m.code === d.code) : undefined
            return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
        })
        parsed.nvidiaModels = merged
        // Initialize Alibaba fields if missing
        if (!parsed.alibabaApiKey) parsed.alibabaApiKey = defaultSettings.alibabaApiKey
        // Always merge with full default list (expanded model catalog); preserve user's enabled state
        const userAlibaba = parsed.alibabaModels
        const mergedAlibaba = defaultSettings.alibabaModels.map((d) => {
            const existing = Array.isArray(userAlibaba) ? userAlibaba.find((m: { code: string }) => m.code === d.code) : undefined
            return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
        })
        // Append any user-added custom models not in defaults
        const defaultCodes = new Set(defaultSettings.alibabaModels.map((d) => d.code))
        const customModels = Array.isArray(userAlibaba)
            ? userAlibaba.filter((m: { code: string }) => !defaultCodes.has(m.code))
            : []
        parsed.alibabaModels = [...mergedAlibaba, ...customModels]
        // Migrate deprecated Groq model IDs when modelProvider is groq
        const deprecatedGroqModelMap: Record<string, string> = {
            'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
            'deepseek-r1-distill-llama-70b': 'llama-3.3-70b-versatile',
            'mixtral-8x7b-32768': 'llama-3.1-8b-instant',
            'gemma2-9b-it': 'llama-3.1-8b-instant',
        }
        if (parsed.modelProvider === 'groq' && parsed.aiModel && deprecatedGroqModelMap[parsed.aiModel]) {
            parsed.aiModel = deprecatedGroqModelMap[parsed.aiModel]
        }
        // Ensure titleModel exists; migrate gemini-* to OpenRouter model
        if (!parsed.titleModel) parsed.titleModel = defaultSettings.titleModel
        if (parsed.titleModel?.startsWith('gemini-')) {
            parsed.titleModel = 'google/gemini-2.0-flash-exp:free'
        }

        // Max tokens sanity + migration
        if (typeof parsed.maxTokens !== 'number' || !Number.isFinite(parsed.maxTokens) || parsed.maxTokens <= 0) {
            parsed.maxTokens = defaultSettings.maxTokens
        }
        if (parsed.modelProvider === 'openrouter' && typeof parsed.aiModel === 'string' && /:free\b/.test(parsed.aiModel) && parsed.maxTokens <= 1000) {
            parsed.maxTokens = 8000
        }
        // Initialize todos if missing
        if (!parsed.todos) parsed.todos = []
        // Initialize tool settings if missing
        if (parsed.toolsEnabled === undefined) parsed.toolsEnabled = defaultSettings.toolsEnabled
        if (!parsed.tavilyApiKey) parsed.tavilyApiKey = defaultSettings.tavilyApiKey
        if (!parsed.enabledTools) parsed.enabledTools = defaultSettings.enabledTools
        if (parsed.webSearchEnabled === undefined) parsed.webSearchEnabled = defaultSettings.webSearchEnabled
        // Migration: deep research removed - ensure webSearchEnabled if it was on
        if ((parsed as Record<string, unknown>).deepResearchEnabled === true) {
            parsed.webSearchEnabled = true
        }
        delete (parsed as Record<string, unknown>).deepResearchEnabled
        // structuredResearchEnabled restored - initialize if missing
        if (parsed.structuredResearchEnabled === undefined) parsed.structuredResearchEnabled = defaultSettings.structuredResearchEnabled
        // Initialize favoriteModels if missing
        if (!parsed.favoriteModels) parsed.favoriteModels = defaultSettings.favoriteModels


        // Title bar personalization - always use compact (narrow) mode
        parsed.titleBarDensity = 'compact'
        if (parsed.titleBarShowAppName === undefined) parsed.titleBarShowAppName = defaultSettings.titleBarShowAppName
        if (parsed.titleBarShowChatTitle === undefined) parsed.titleBarShowChatTitle = defaultSettings.titleBarShowChatTitle
        if (parsed.titleBarShowModel === undefined) parsed.titleBarShowModel = defaultSettings.titleBarShowModel
        if (parsed.rememberLastChatSession === undefined) parsed.rememberLastChatSession = defaultSettings.rememberLastChatSession
        if (parsed.rememberLastSettingsSection === undefined) parsed.rememberLastSettingsSection = defaultSettings.rememberLastSettingsSection
        if (parsed.rememberLastDashboardView === undefined) parsed.rememberLastDashboardView = defaultSettings.rememberLastDashboardView
        // Initialize commandBar settings if missing
        if (!parsed.commandBar) parsed.commandBar = defaultSettings.commandBar

        // Initialize configuredModels if missing or empty
        if (!parsed.configuredModels || parsed.configuredModels.length === 0) {
            parsed.configuredModels = defaultSettings.configuredModels
        }
        // Initialize activeTheme if missing (new theme system)
        if (!parsed.activeTheme) parsed.activeTheme = defaultSettings.activeTheme
        // Initialize frostedSidebar if missing (glassmorphism effect)
        if (parsed.frostedSidebar === undefined) parsed.frostedSidebar = defaultSettings.frostedSidebar
        // Initialize frostedPrompt if missing (glassmorphism effect)
        if (parsed.frostedPrompt === undefined) parsed.frostedPrompt = defaultSettings.frostedPrompt
        // Initialize sidebarAutoHideOnResize if missing
        if (parsed.sidebarAutoHideOnResize === undefined) parsed.sidebarAutoHideOnResize = defaultSettings.sidebarAutoHideOnResize
        // Initialize softenedContrast if missing
        if (parsed.softenedContrast === undefined) parsed.softenedContrast = defaultSettings.softenedContrast
        // Initialize chatBubbleStyle if missing
        if (!parsed.chatBubbleStyle) parsed.chatBubbleStyle = defaultSettings.chatBubbleStyle
        // Initialize/migrate chatSelectedOverlayStyle if missing
        const legacyChatSelectedOverlayMap: Partial<Record<string, NonNullable<SettingsUI['chatSelectedOverlayStyle']>>> = {
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
            } else if (!['linear', 'notion', 'slack', 'discord', 'github'].includes(rawChatSelectedOverlayStyle)) {
                parsed.chatSelectedOverlayStyle = defaultSettings.chatSelectedOverlayStyle
            }
        }

        return parsed
    })

    // Extract UI and Config settings for child providers
    const initialUISettings = useMemo<Partial<SettingsUI>>(() => ({
        theme: storedSettings.theme,
        activeTheme: storedSettings.activeTheme,
        titleBarDensity: storedSettings.titleBarDensity,
        titleBarShowAppName: storedSettings.titleBarShowAppName,
        titleBarShowChatTitle: storedSettings.titleBarShowChatTitle,
        titleBarShowModel: storedSettings.titleBarShowModel,
        commandBar: storedSettings.commandBar,
        frostedSidebar: storedSettings.frostedSidebar,
        frostedPrompt: storedSettings.frostedPrompt,
        sidebarAutoHideOnResize: storedSettings.sidebarAutoHideOnResize,
        softenedContrast: storedSettings.softenedContrast,
        chatBubbleStyle: storedSettings.chatBubbleStyle,
        chatSelectedOverlayStyle: storedSettings.chatSelectedOverlayStyle,
    }), [storedSettings])

    const initialConfigSettings = useMemo<Partial<SettingsConfig>>(() => ({
        openRouterApiKey: storedSettings.openRouterApiKey,
        perplexityApiKey: storedSettings.perplexityApiKey,
        groqApiKey: storedSettings.groqApiKey,
        tavilyApiKey: storedSettings.tavilyApiKey,
        nvidiaApiKey: storedSettings.nvidiaApiKey,
        alibabaApiKey: storedSettings.alibabaApiKey,
        aiModel: storedSettings.aiModel,
        modelProvider: storedSettings.modelProvider,
        configuredModels: storedSettings.configuredModels,
        ollamaUrl: storedSettings.ollamaUrl,
        ollamaModels: storedSettings.ollamaModels,
        perplexityModels: storedSettings.perplexityModels,
        groqModels: storedSettings.groqModels,
        nvidiaModels: storedSettings.nvidiaModels,
        alibabaModels: storedSettings.alibabaModels,
        temperature: storedSettings.temperature,
        maxTokens: storedSettings.maxTokens,
        systemPrompt: storedSettings.systemPrompt,
        webSearchPrompt: storedSettings.webSearchPrompt,
        streamResponses: storedSettings.streamResponses,
        toolsEnabled: storedSettings.toolsEnabled,
        enabledTools: storedSettings.enabledTools,
        webSearchEnabled: storedSettings.webSearchEnabled,
        structuredResearchEnabled: storedSettings.structuredResearchEnabled,
        titleModel: storedSettings.titleModel,
        favoriteModels: storedSettings.favoriteModels,
        quickPrompts: storedSettings.quickPrompts,
        todos: storedSettings.todos,
        rememberLastChatSession: storedSettings.rememberLastChatSession,
        rememberLastSettingsSection: storedSettings.rememberLastSettingsSection,
        rememberLastDashboardView: storedSettings.rememberLastDashboardView,
    }), [storedSettings])

    // Track combined settings for localStorage persistence
    const [combinedSettings, setCombinedSettings] = useState<Settings>(storedSettings)

    // Callbacks to sync settings from child contexts
    const handleUISettingsChange = useCallback((uiSettings: SettingsUI) => {
        setCombinedSettings(prev => ({ ...prev, ...uiSettings }))
    }, [])

    const handleConfigSettingsChange = useCallback((configSettings: SettingsConfig) => {
        setCombinedSettings(prev => ({ ...prev, ...configSettings }))
    }, [])

    // Persist combined settings to localStorage
    useEffect(() => {
        localStorage.setItem('zura-settings', JSON.stringify(combinedSettings))
    }, [combinedSettings])


    // Listen for storage events from other windows/tabs
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'zura-settings' && e.newValue) {
                const newSettings = JSON.parse(e.newValue)
                setCombinedSettings(newSettings)
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
                <SettingsContextBridge>
                    {children}
                </SettingsContextBridge>
            </SettingsConfigProvider>
        </SettingsUIProvider>
    )
}

/**
 * Combined settings hook for backward compatibility
 * 
 * For better performance, prefer using the specific hooks:
 * - useSettingsUI() - For theme, title bar, and command bar settings
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
