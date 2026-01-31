import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import { loadApiKeysFromSecureStorage, migrateApiKeysFromLocalStorage } from '../utils/secureApiKeys'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'
import { getThemeById, getDefaultTheme } from '../themes/themeRegistry'
import { applyThemeToDocument } from '../themes/themeUtils'

export interface Settings {
    theme: 'light' | 'dark' | 'system'
    activeTheme: string  // Theme ID for the new theme system
    openRouterApiKey: string
    aiModel: string
    temperature: number
    maxTokens: number
    autoHideOverlay: boolean
    overlayTransparency: number
    loadOverlayOnStartup: boolean
    shortcuts: {
        toggleOverlay: string
    }
    systemPrompt: string
    streamResponses: boolean
    configuredModels: Array<{ code: string; displayName: string }>
    // Provider settings
    modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'gemini' | 'groq' | 'minimax'
    ollamaUrl: string
    ollamaModels: Array<{ code: string; displayName: string }>
    perplexityApiKey: string
    perplexityModels: Array<{ code: string; displayName: string }>
    // Gemini settings
    geminiApiKey: string
    geminiModels: Array<{ code: string; displayName: string }>
    // Groq settings
    groqApiKey: string
    groqModels: Array<{ code: string; displayName: string }>
    // MiniMax settings
    minimaxApiKey: string
    minimaxModels: Array<{ code: string; displayName: string }>
    // Quick prompts for welcome screen
    quickPrompts: string[]
    // Title generation model
    titleModel: string
    // Todo items
    todos: TodoItem[]
    // Tool settings
    toolsEnabled: boolean
    tavilyApiKey: string
    enabledTools: string[]  // Which tools are active (empty = all enabled)
    webSearchEnabled: boolean  // Quick toggle for web search in chat
    deepResearchEnabled: boolean  // Toggle for deep research mode (mandatory 3 searches)
    // Favorite models
    favoriteModels: string[]

    // UI personalization
    titleBarDensity: 'comfortable' | 'compact'
    titleBarShowAppName: boolean
    titleBarShowChatTitle: boolean
    titleBarShowModel: boolean
    rememberLastChatSession: boolean
    rememberLastSettingsSection: boolean
    rememberLastDashboardView: boolean
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
}

// Todo item structure
export interface TodoItem {
    id: string
    text: string
    completed: boolean
    createdAt: number
}

const defaultSettings: Settings = {
    theme: 'dark',
    activeTheme: 'dark-default',
    openRouterApiKey: '',
    perplexityApiKey: '',
    aiModel: 'x-ai/grok-4.1-fast',
    titleModel: 'gemini-2.5-flash', // Default to fast free model
    temperature: 0.7,
    // Max output tokens per response (providers may still enforce their own caps)
    maxTokens: 8000,
    autoHideOverlay: false,
    overlayTransparency: 0.95,
    loadOverlayOnStartup: false,
    shortcuts: {
        toggleOverlay: 'CommandOrControl+Shift+Z'
    },
    systemPrompt: defaultSystemPrompt,
    streamResponses: false,
    configuredModels: [
        // Top Models 2025 (Text Only)
        { code: 'anthropic/claude-sonnet-4', displayName: 'Claude Sonnet 4' },
        { code: 'openai/gpt-4o', displayName: 'GPT-4o' },
        { code: 'google/gemini-3-flash-preview', displayName: 'Gemini 3 Flash (Preview)' },
        { code: 'google/gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
        { code: 'google/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { code: 'google/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast' },
        { code: 'deepseek/deepseek-r1', displayName: 'DeepSeek R1' },
        { code: 'meta-llama/llama-4-scout', displayName: 'Llama 4 Scout' },
        // Online/Search Models
        { code: 'anthropic/claude-sonnet-4:online', displayName: 'Claude Sonnet 4 (Online)' },
        { code: 'google/gemini-2.5-flash:online', displayName: 'Gemini 2.5 Flash (Online)' },
        { code: 'deepseek/deepseek-r1:online', displayName: 'DeepSeek R1 (Online)' },
        // Deep Research Models
        { code: 'perplexity/sonar-deep-research', displayName: 'Sonar Deep Research' },
        { code: 'openai/o3-deep-research', displayName: 'o3 Deep Research' },
        { code: 'openai/o4-mini-deep-research', displayName: 'o4-mini Deep Research' },
        // Free Models (Text Only)
        { code: 'google/gemma-3-27b-it:free', displayName: 'Gemma 3 27B' },
        { code: 'arcee-ai/trinity-mini:free', displayName: 'Trinity Mini' },
    ],
    modelProvider: 'openrouter',
    ollamaUrl: 'http://localhost:11434',
    ollamaModels: [],
    perplexityModels: [
        // Sonar Models (2025)
        { code: 'sonar', displayName: 'Sonar' },
        { code: 'sonar-pro', displayName: 'Sonar Pro' },
        { code: 'sonar-reasoning', displayName: 'Sonar Reasoning' },
        { code: 'sonar-reasoning-pro', displayName: 'Sonar Reasoning Pro' },
        { code: 'sonar-deep-research', displayName: 'Sonar Deep Research' },
        // Llama 3.1 Sonar Variants (128k Context)
        { code: 'llama-3.1-sonar-small-128k-online', displayName: 'Llama 3.1 Sonar Small 128k Online' },
        { code: 'llama-3.1-sonar-medium-128k-online', displayName: 'Llama 3.1 Sonar Medium 128k Online' },
        { code: 'llama-3.1-sonar-large-128k-online', displayName: 'Llama 3.1 Sonar Large 128k Online' },
        { code: 'llama-3.1-sonar-huge-128k-online', displayName: 'Llama 3.1 Sonar Huge 128k Online' },
    ],
    geminiApiKey: '',
    geminiModels: [
        // Gemini 3.0 Models (Preview - Text Only)
        { code: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash (Preview)' },
        { code: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
        // Gemini 2.5 Models (Stable - Text Only)
        { code: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { code: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { code: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
    ],
    groqApiKey: '',
    groqModels: [
        // Llama 4 (Latest 2025)
        { code: 'llama-4-scout', displayName: 'Llama 4 Scout' },
        // Llama 3.3
        { code: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B Versatile' },
        // Llama 3.1
        { code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant' },
        // DeepSeek R1 Distill
        { code: 'deepseek-r1-distill-llama-70b', displayName: 'DeepSeek R1 Distill Llama 70B' },
        // Other models
        { code: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B' },
        { code: 'gemma2-9b-it', displayName: 'Gemma 2 9B' },
    ],
    minimaxApiKey: '',
    minimaxModels: [
        { code: 'MiniMax-M2.1', displayName: 'MiniMax M2.1' },
        { code: 'MiniMax-M2.1-lightning', displayName: 'MiniMax M2.1 Lightning' },
        { code: 'MiniMax-M2', displayName: 'MiniMax M2' },
    ],
    quickPrompts: [
        'Explain this code to me',
        'Help me debug an error',
        'Write a summary of...',
        'Brainstorm ideas for...'
    ],
    todos: [],
    toolsEnabled: true,
    tavilyApiKey: '',
    enabledTools: ['web_search', 'get_datetime'],
    webSearchEnabled: true,
    deepResearchEnabled: false,
    favoriteModels: [],

    titleBarDensity: 'comfortable',
    titleBarShowAppName: true,
    titleBarShowChatTitle: true,
    titleBarShowModel: true,
    rememberLastChatSession: true,
    rememberLastSettingsSection: true,
    rememberLastDashboardView: true,
    // Command bar settings
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
}

interface SettingsContextType {
    settings: Settings
    updateSettings: (newSettings: Partial<Settings>) => void
    resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('zura-settings')
        const parsed = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings

        // Force migration: if model is the old default, switch to Grok
        if (parsed.aiModel === 'openrouter/sherlock-dash-alpha') {
            parsed.aiModel = 'x-ai/grok-4.1-fast'
        }

        // Force migration: System Prompt update for better formatting
        if (parsed.systemPrompt.includes('Keep responses concise and actionable')) {
            parsed.systemPrompt = defaultSettings.systemPrompt
        }

        // Initialize new fields if missing
        if (!parsed.modelProvider) parsed.modelProvider = defaultSettings.modelProvider
        if (!parsed.ollamaUrl) parsed.ollamaUrl = defaultSettings.ollamaUrl
        if (!parsed.ollamaModels) parsed.ollamaModels = defaultSettings.ollamaModels
        if (!parsed.perplexityApiKey) parsed.perplexityApiKey = defaultSettings.perplexityApiKey
        if (!parsed.perplexityModels) parsed.perplexityModels = defaultSettings.perplexityModels
        if (!parsed.geminiApiKey) parsed.geminiApiKey = defaultSettings.geminiApiKey
        // Force migration: Always use latest Gemini models
        parsed.geminiModels = defaultSettings.geminiModels
        // Initialize Groq fields if missing
        if (!parsed.groqApiKey) parsed.groqApiKey = defaultSettings.groqApiKey
        if (!parsed.groqModels) parsed.groqModels = defaultSettings.groqModels
        // Initialize MiniMax fields if missing
        if (!parsed.minimaxApiKey) parsed.minimaxApiKey = defaultSettings.minimaxApiKey
        if (!parsed.minimaxModels) parsed.minimaxModels = defaultSettings.minimaxModels
        // Ensure titleModel exists
        if (!parsed.titleModel) parsed.titleModel = defaultSettings.titleModel

        // Max tokens sanity + migration
        // Some older installs/defaults used 1000; for OpenRouter :free models this is often too small.
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
        if (parsed.deepResearchEnabled === undefined) parsed.deepResearchEnabled = defaultSettings.deepResearchEnabled
        // Initialize loadOverlayOnStartup if missing
        if (parsed.loadOverlayOnStartup === undefined) parsed.loadOverlayOnStartup = defaultSettings.loadOverlayOnStartup
        // Initialize favoriteModels if missing
        if (!parsed.favoriteModels) parsed.favoriteModels = defaultSettings.favoriteModels

        // Title bar personalization
        if (!parsed.titleBarDensity || !['comfortable', 'compact'].includes(parsed.titleBarDensity)) {
            parsed.titleBarDensity = defaultSettings.titleBarDensity
        }
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

        return parsed
    })

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'zura-settings' && e.newValue) {
                setSettings(JSON.parse(e.newValue))
            }
        }
        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [])

    // Load API keys from secure storage on startup
    useEffect(() => {
        const loadSecureKeys = async () => {
            try {
                // Migrate existing keys from localStorage if needed
                await migrateApiKeysFromLocalStorage(settings)

                // Load from secure storage
                const secureKeys = await loadApiKeysFromSecureStorage()

                // Check if we got any keys
                const hasSecureKeys = secureKeys.openRouterApiKey || secureKeys.perplexityApiKey ||
                    secureKeys.geminiApiKey || secureKeys.groqApiKey || secureKeys.tavilyApiKey ||
                    secureKeys.minimaxApiKey

                if (hasSecureKeys) {
                    // Update settings with secure keys - prefer secure storage values
                    setSettings(prev => ({
                        ...prev,
                        openRouterApiKey: secureKeys.openRouterApiKey || prev.openRouterApiKey,
                        perplexityApiKey: secureKeys.perplexityApiKey || prev.perplexityApiKey,
                        geminiApiKey: secureKeys.geminiApiKey || prev.geminiApiKey,
                        groqApiKey: secureKeys.groqApiKey || prev.groqApiKey,
                        tavilyApiKey: secureKeys.tavilyApiKey || prev.tavilyApiKey,
                        minimaxApiKey: secureKeys.minimaxApiKey || prev.minimaxApiKey,
                    }))
                }

            } catch (error) {
                console.error('[SettingsContext] Failed to load API keys from secure storage:', error)
            }
        }
        loadSecureKeys()
    }, []) // Only run on mount

    // Auto-fetch Ollama models on startup
    useEffect(() => {
        const fetchOllamaModels = async () => {
            try {
                const isConnected = await checkOllamaStatus(settings.ollamaUrl)
                if (isConnected) {
                    const models = await listOllamaModels(settings.ollamaUrl)
                    if (models.length > 0) {
                        const formatted = models.map(m => ({
                            code: m.name,
                            displayName: `${m.name} (${m.details.parameter_size})`
                        }))
                        setSettings(prev => ({ ...prev, ollamaModels: formatted }))
                    }
                }
            } catch { /* Ollama not available */ }
        }
        fetchOllamaModels()
    }, [])

    useEffect(() => {
        // Save settings to localStorage
        // We now keep API keys in localStorage as a fallback in case secure storage fails
        // The secure storage is still the primary storage for keys (encrypted)
        // But having them in localStorage ensures they're not lost on secure storage failures
        localStorage.setItem('zura-settings', JSON.stringify(settings))

        // Note: settings-changed IPC was removed as there's no handler in main process
        // Settings sync happens via localStorage + storage events
    }, [settings])

    useLayoutEffect(() => {
        const theme = getThemeById(settings.activeTheme) || getDefaultTheme()
        applyThemeToDocument(theme)

        // Keep native Windows title bar overlay in sync
        if (window.ipcRenderer) {
            const height = settings.titleBarDensity === 'compact' ? 36 : 44
            window.ipcRenderer.send('set-titlebar-overlay', {
                color: 'rgba(0, 0, 0, 0)',
                symbolColor: theme.colors.textPrimary,
                height,
            })
        }
    }, [settings.activeTheme, settings.titleBarDensity])

    const updateSettings = useCallback((newSettings: Partial<Settings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings }
            return updated
        })
    }, [])

    const resetSettings = useCallback(() => {
        setSettings(defaultSettings)
    }, [])

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

export function useSettings() {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        // During HMR, the context may temporarily be undefined
        // This prevents crashes during hot reload in development
        if (import.meta.hot) {
            console.warn('[SettingsContext] Context undefined during HMR, using defaults')
            return {
                settings: defaultSettings,
                updateSettings: () => {},
                ollamaStatus: 'disconnected' as const,
                checkOllama: async () => {},
            }
        }
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}
