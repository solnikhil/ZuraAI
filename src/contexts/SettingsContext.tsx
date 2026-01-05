import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import { loadApiKeysFromSecureStorage, migrateApiKeysFromLocalStorage } from '../utils/secureApiKeys'
import { setDynamicToolDefinitions, ToolDefinition } from '../tools/definitions'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'

export interface McpServerConfig {
    id: string
    name: string
    enabled: boolean
    transport: 'stdio' | 'http'
    command?: string
    args?: string
    cwd?: string
    env?: string
    url?: string
    headers?: string
    requiresApproval?: boolean
    timeoutMs?: number
}

export interface McpServerStatus {
    id: string
    name: string
    enabled: boolean
    status: 'ready' | 'error' | 'disabled'
    error?: string
    toolCount?: number
}

export interface Settings {
    theme: 'light' | 'dark' | 'system'
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
    modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'gemini' | 'groq' | 'codex'
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
    // Codex settings (uses OAuth, no API key needed)
    codexModels: Array<{ code: string; displayName: string; description?: string; isDefault?: boolean }>
    codexSelectedModel: string
    codexReasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
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
    toolApprovalMode: 'always' | 'sensitive' | 'never'
    webSearchEnabled: boolean  // Quick toggle for web search in chat
    mcpServers: McpServerConfig[]
    // Favorite models
    favoriteModels: string[]
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
    openRouterApiKey: '',
    perplexityApiKey: '',
    aiModel: 'x-ai/grok-4.1-fast',
    titleModel: 'gemini-2.0-flash', // Default to fast free model
    temperature: 0.7,
    maxTokens: 1000,
    autoHideOverlay: false,
    overlayTransparency: 0.95,
    loadOverlayOnStartup: false,
    shortcuts: {
        toggleOverlay: 'CommandOrControl+Shift+Z'
    },
    systemPrompt: defaultSystemPrompt,
    streamResponses: false,
    configuredModels: [
        { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast' },
        { code: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet' },
        { code: 'openai/gpt-4o', displayName: 'GPT-4o' },
        { code: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini' },
        { code: 'google/gemini-2.0-flash-exp:free', displayName: 'Gemini 2.0 Flash' },
        { code: 'meta-llama/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B' },
    ],
    modelProvider: 'openrouter',
    ollamaUrl: 'http://localhost:11434',
    ollamaModels: [],
    perplexityModels: [
        { code: 'sonar', displayName: 'Sonar' },
        { code: 'sonar-pro', displayName: 'Sonar Pro' },
        { code: 'sonar-reasoning', displayName: 'Sonar Reasoning' },
        { code: 'sonar-reasoning-pro', displayName: 'Sonar Reasoning Pro' },
        { code: 'sonar-deep-research', displayName: 'Sonar Deep Research' },
    ],
    geminiApiKey: '',
    geminiModels: [
        // Gemini 3.0 Models (Preview)
        { code: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
        { code: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image (Preview)' },
        { code: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash (Preview)' },
        // Gemini 2.5 Models (Stable)
        { code: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { code: 'gemini-2.5-pro-preview-tt', displayName: 'Gemini 2.5 Pro Thinking (Preview)' },
        { code: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { code: 'gemini-2.5-flash-preview-tt', displayName: 'Gemini 2.5 Flash Thinking (Preview)' },
        { code: 'gemini-2.5-flash-image', displayName: 'Gemini 2.5 Flash Image' },
        { code: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
        { code: 'gemini-2.5-flash-native-audio-preview-12-2025', displayName: 'Gemini 2.5 Flash Native Audio (Preview)' },
        // Gemini 2.0 Models (Latest Stable)
        { code: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (Latest)' },
        { code: 'gemini-2.0-flash-001', displayName: 'Gemini 2.0 Flash (Stable)' },
        { code: 'gemini-2.0-flash-exp', displayName: 'Gemini 2.0 Flash (Experimental)' },
        { code: 'gemini-2.0-flash-preview-image-generation', displayName: 'Gemini 2.0 Flash Image Gen (Preview)' },
        { code: 'gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash Lite' },
    ],
    groqApiKey: '',
    groqModels: [
        { code: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B' },
        { code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant' },
        { code: 'llama-guard-3-8b', displayName: 'Llama Guard 3 8B' },
        { code: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B' },
        { code: 'gemma2-9b-it', displayName: 'Gemma 2 9B' },
    ],
    codexModels: [
        // Official Codex CLI models - Reference: research-codex/codex/codex-rs/core/src/models_manager/model_presets.rs
        { code: 'gpt-5.2-codex-medium', displayName: 'GPT-5.2 Codex', description: 'Latest frontier agentic coding model (default)', isDefault: true },
        { code: 'gpt-5.2-codex-high', displayName: 'GPT-5.2 Codex (High)', description: 'Greater reasoning depth' },
        { code: 'gpt-5.2-codex-xhigh', displayName: 'GPT-5.2 Codex (XHigh)', description: 'Extra high reasoning' },
        { code: 'gpt-5.1-codex-max-medium', displayName: 'GPT-5.1 Codex Max', description: 'Flagship for deep and fast reasoning' },
        { code: 'gpt-5.1-codex-max-high', displayName: 'GPT-5.1 Codex Max (High)', description: 'Greater reasoning depth' },
        { code: 'gpt-5.1-codex-max-xhigh', displayName: 'GPT-5.1 Codex Max (XHigh)', description: 'Maximum reasoning' },
        { code: 'gpt-5.1-codex-mini-medium', displayName: 'GPT-5.1 Codex Mini', description: 'Cheaper, faster' },
        { code: 'gpt-5.1-codex-mini-high', displayName: 'GPT-5.1 Codex Mini (High)', description: 'Maximizes reasoning' },
    ],
    codexSelectedModel: 'gpt-5.2-codex-medium',
    codexReasoningEffort: 'medium',
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
    toolApprovalMode: 'never',
    webSearchEnabled: true,
    mcpServers: [],
    favoriteModels: []
}

interface SettingsContextType {
    settings: Settings
    updateSettings: (newSettings: Partial<Settings>) => void
    resetSettings: () => void
    mcpTools: ToolDefinition[]
    mcpServerStatuses: McpServerStatus[]
    refreshMcpTools: (serversOverride?: McpServerConfig[]) => Promise<void>
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
        // Initialize Codex fields if missing
        if (!parsed.codexModels) parsed.codexModels = defaultSettings.codexModels
        if (!parsed.codexSelectedModel) parsed.codexSelectedModel = defaultSettings.codexSelectedModel
        // Force migration: Always use latest Codex models (official Codex CLI approach)
        parsed.codexModels = defaultSettings.codexModels
        // Migrate old model selections to new format (gpt-5.2-codex is the new default)
        if (!parsed.codexSelectedModel?.startsWith('gpt-5.2-codex-') && !parsed.codexSelectedModel?.startsWith('gpt-5.1-codex-')) {
            parsed.codexSelectedModel = 'gpt-5.2-codex-medium'
        }
        // Initialize codexReasoningEffort if missing or invalid
        if (!parsed.codexReasoningEffort || !['minimal', 'low', 'medium', 'high', 'xhigh'].includes(parsed.codexReasoningEffort)) {
            parsed.codexReasoningEffort = defaultSettings.codexReasoningEffort
        }
        // Ensure titleModel exists
        if (!parsed.titleModel) parsed.titleModel = defaultSettings.titleModel
        // Initialize todos if missing
        if (!parsed.todos) parsed.todos = []
        // Initialize tool settings if missing
        if (parsed.toolsEnabled === undefined) parsed.toolsEnabled = defaultSettings.toolsEnabled
        if (!parsed.tavilyApiKey) parsed.tavilyApiKey = defaultSettings.tavilyApiKey
        if (!parsed.enabledTools) parsed.enabledTools = defaultSettings.enabledTools
        if (!parsed.toolApprovalMode) parsed.toolApprovalMode = defaultSettings.toolApprovalMode
        if (parsed.webSearchEnabled === undefined) parsed.webSearchEnabled = defaultSettings.webSearchEnabled
        if (!parsed.mcpServers) parsed.mcpServers = defaultSettings.mcpServers
        // Initialize loadOverlayOnStartup if missing
        if (parsed.loadOverlayOnStartup === undefined) parsed.loadOverlayOnStartup = defaultSettings.loadOverlayOnStartup
        // Initialize favoriteModels if missing
        if (!parsed.favoriteModels) parsed.favoriteModels = defaultSettings.favoriteModels
        // Initialize configuredModels if missing or empty
        if (!parsed.configuredModels || parsed.configuredModels.length === 0) {
            parsed.configuredModels = defaultSettings.configuredModels
        }

        return parsed
    })
    const [mcpTools, setMcpTools] = useState<ToolDefinition[]>([])
    const [mcpServerStatuses, setMcpServerStatuses] = useState<McpServerStatus[]>([])

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
                    secureKeys.geminiApiKey || secureKeys.groqApiKey

                if (hasSecureKeys) {
                    // Update settings with secure keys - prefer secure storage values
                    setSettings(prev => ({
                        ...prev,
                        openRouterApiKey: secureKeys.openRouterApiKey || prev.openRouterApiKey,
                        perplexityApiKey: secureKeys.perplexityApiKey || prev.perplexityApiKey,
                        geminiApiKey: secureKeys.geminiApiKey || prev.geminiApiKey,
                        groqApiKey: secureKeys.groqApiKey || prev.groqApiKey,
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

        // Apply theme
        const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        if (isDark) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }

        // Also listen for system theme changes when theme is set to 'system'
        if (settings.theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            const handleSystemThemeChange = (e: MediaQueryListEvent) => {
                if (settings.theme === 'system') {
                    if (e.matches) {
                        document.documentElement.classList.add('dark')
                    } else {
                        document.documentElement.classList.remove('dark')
                    }
                }
            }
            mediaQuery.addEventListener('change', handleSystemThemeChange)
            return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
        }

        // Sync with main process (API keys are sent but main process doesn't store them)
        if (window.ipcRenderer) {
            window.ipcRenderer.send('settings-changed', settings)
        }
    }, [settings])

    const refreshMcpTools = useCallback(async (serversOverride?: McpServerConfig[]) => {
        if (!window.ipcRenderer) {
            setMcpTools([])
            setDynamicToolDefinitions([])
            setMcpServerStatuses([])
            return
        }

        try {
            const result = await window.ipcRenderer.invoke('mcp:list-tools', serversOverride ?? settings.mcpServers)
            const tools = Array.isArray(result?.tools) ? result.tools : []
            const statuses = Array.isArray(result?.servers) ? result.servers : []

            setMcpTools(tools)
            setDynamicToolDefinitions(tools)
            setMcpServerStatuses(statuses)
        } catch (error) {
            console.error('[SettingsContext] Failed to refresh MCP tools:', error)
            setMcpTools([])
            setDynamicToolDefinitions([])
            setMcpServerStatuses([])
        }
    }, [settings.mcpServers])

    useEffect(() => {
        refreshMcpTools()
    }, [refreshMcpTools])

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
        mcpTools,
        mcpServerStatuses,
        refreshMcpTools
    }), [settings, updateSettings, resetSettings, mcpTools, mcpServerStatuses, refreshMcpTools])

    return (
        <SettingsContext.Provider value={contextValue}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings() {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}
