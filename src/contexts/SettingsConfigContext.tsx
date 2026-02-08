/**
 * SettingsConfigContext - Context for stable configuration settings
 * 
 * This context contains settings that change infrequently:
 * - API keys for various providers
 * - Model configurations
 * - AI parameters (temperature, maxTokens, systemPrompt)
 * - Tool settings
 * - User preferences (shortcuts, remember settings)
 * 
 * **Validates: Requirements 8.1**
 * - THE SettingsContext SHALL split into separate contexts for frequently-changing 
 *   values (theme, UI state) and stable values (API keys, model configs)
 * 
 * @module SettingsConfigContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import { loadApiKeysFromSecureStorage, migrateApiKeysFromLocalStorage } from '../utils/secureApiKeys'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'

// Todo item structure (shared with main Settings)
export interface TodoItem {
    id: string
    text: string
    completed: boolean
    createdAt: number
}

/**
 * Configuration-related settings that change infrequently
 */
export interface SettingsConfig {
    // API Keys
    openRouterApiKey: string
    perplexityApiKey: string
    geminiApiKey: string
    groqApiKey: string
    minimaxApiKey: string
    tavilyApiKey: string
    
    // Model settings
    aiModel: string
    modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'gemini' | 'groq' | 'minimax'
    configuredModels: Array<{ code: string; displayName: string }>
    ollamaUrl: string
    ollamaModels: Array<{ code: string; displayName: string }>
    perplexityModels: Array<{ code: string; displayName: string }>
    geminiModels: Array<{ code: string; displayName: string }>
    groqModels: Array<{ code: string; displayName: string }>
    minimaxModels: Array<{ code: string; displayName: string }>
    
    // AI parameters
    temperature: number
    maxTokens: number
    systemPrompt: string
    streamResponses: boolean
    
    // Tool settings
    toolsEnabled: boolean
    enabledTools: string[]
    webSearchEnabled: boolean
    deepResearchEnabled: boolean
    
    // Title generation
    titleModel: string
    
    // Favorites
    favoriteModels: string[]
    
    // Quick prompts
    quickPrompts: string[]
    
    // Todos
    todos: TodoItem[]
    
    // Shortcuts
    shortcuts: {
        toggleOverlay: string
    }
    
    // Remember settings
    rememberLastChatSession: boolean
    rememberLastSettingsSection: boolean
    rememberLastDashboardView: boolean
}

/**
 * Default configuration settings
 */
export const defaultSettingsConfig: SettingsConfig = {
    // API Keys
    openRouterApiKey: '',
    perplexityApiKey: '',
    geminiApiKey: '',
    groqApiKey: '',
    minimaxApiKey: '',
    tavilyApiKey: '',
    
    // Model settings
    aiModel: 'x-ai/grok-4.1-fast',
    modelProvider: 'openrouter',
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
    geminiModels: [
        // Gemini 3.0 Models (Preview - Text Only)
        { code: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash (Preview)' },
        { code: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
        // Gemini 2.5 Models (Stable - Text Only)
        { code: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { code: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { code: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
    ],
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
    minimaxModels: [
        { code: 'MiniMax-M2.1', displayName: 'MiniMax M2.1' },
        { code: 'MiniMax-M2.1-lightning', displayName: 'MiniMax M2.1 Lightning' },
        { code: 'MiniMax-M2', displayName: 'MiniMax M2' },
    ],
    
    // AI parameters
    temperature: 0.7,
    maxTokens: 8000,
    systemPrompt: defaultSystemPrompt,
    streamResponses: false,
    
    // Tool settings
    toolsEnabled: true,
    enabledTools: ['web_search', 'get_datetime'],
    webSearchEnabled: true,
    deepResearchEnabled: false,
    
    // Title generation
    titleModel: 'gemini-2.5-flash',
    
    // Favorites
    favoriteModels: [],
    
    // Quick prompts
    quickPrompts: [
        'Explain this code to me',
        'Help me debug an error',
        'Write a summary of...',
        'Brainstorm ideas for...'
    ],
    
    // Todos
    todos: [],
    
    // Shortcuts
    shortcuts: {
        toggleOverlay: 'CommandOrControl+Shift+Z'
    },
    
    // Remember settings
    rememberLastChatSession: true,
    rememberLastSettingsSection: true,
    rememberLastDashboardView: true,
}

interface SettingsConfigContextType {
    settingsConfig: SettingsConfig
    updateSettingsConfig: (newSettings: Partial<SettingsConfig>) => void
}

const SettingsConfigContext = createContext<SettingsConfigContextType | undefined>(undefined)

interface SettingsConfigProviderProps {
    children: React.ReactNode
    /**
     * Initial settings loaded from storage (passed from parent SettingsProvider)
     */
    initialSettings?: Partial<SettingsConfig>
    /**
     * Callback when settings change (for syncing with parent SettingsProvider)
     */
    onSettingsChange?: (settings: SettingsConfig) => void
}

export function SettingsConfigProvider({ 
    children, 
    initialSettings,
    onSettingsChange 
}: SettingsConfigProviderProps) {
    const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>(() => {
        return { ...defaultSettingsConfig, ...initialSettings }
    })

    // Sync with parent when initialSettings change (e.g., from storage events)
    useEffect(() => {
        if (initialSettings) {
            setSettingsConfig(prev => ({ ...prev, ...initialSettings }))
        }
    }, [initialSettings])

    // Load API keys from secure storage on startup
    useEffect(() => {
        const loadSecureKeys = async () => {
            try {
                // Migrate existing keys from localStorage if needed
                await migrateApiKeysFromLocalStorage({
                    openRouterApiKey: settingsConfig.openRouterApiKey,
                    perplexityApiKey: settingsConfig.perplexityApiKey,
                    geminiApiKey: settingsConfig.geminiApiKey,
                    groqApiKey: settingsConfig.groqApiKey,
                    tavilyApiKey: settingsConfig.tavilyApiKey,
                    minimaxApiKey: settingsConfig.minimaxApiKey,
                })

                // Load from secure storage
                const secureKeys = await loadApiKeysFromSecureStorage()

                // Check if we got any keys
                const hasSecureKeys = secureKeys.openRouterApiKey || secureKeys.perplexityApiKey ||
                    secureKeys.geminiApiKey || secureKeys.groqApiKey || secureKeys.tavilyApiKey ||
                    secureKeys.minimaxApiKey

                if (hasSecureKeys) {
                    // Update settings with secure keys - prefer secure storage values
                    setSettingsConfig(prev => ({
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
                console.error('[SettingsConfigContext] Failed to load API keys from secure storage:', error)
            }
        }
        loadSecureKeys()
    }, []) // Only run on mount

    // Auto-fetch Ollama models on startup
    useEffect(() => {
        const fetchOllamaModels = async () => {
            try {
                const isConnected = await checkOllamaStatus(settingsConfig.ollamaUrl)
                if (isConnected) {
                    const models = await listOllamaModels(settingsConfig.ollamaUrl)
                    if (models.length > 0) {
                        const formatted = models.map(m => ({
                            code: m.name,
                            displayName: `${m.name} (${m.details.parameter_size})`
                        }))
                        setSettingsConfig(prev => ({ ...prev, ollamaModels: formatted }))
                    }
                }
            } catch { /* Ollama not available */ }
        }
        fetchOllamaModels()
    }, [])

    // Notify parent of changes
    useEffect(() => {
        onSettingsChange?.(settingsConfig)
    }, [settingsConfig, onSettingsChange])

    const updateSettingsConfig = useCallback((newSettings: Partial<SettingsConfig>) => {
        setSettingsConfig(prev => ({ ...prev, ...newSettings }))
    }, [])

    const contextValue = useMemo(() => ({
        settingsConfig,
        updateSettingsConfig,
    }), [settingsConfig, updateSettingsConfig])

    return (
        <SettingsConfigContext.Provider value={contextValue}>
            {children}
        </SettingsConfigContext.Provider>
    )
}

/**
 * Hook to access configuration-related settings
 * Use this hook when you need API keys, model settings, AI parameters, or tool settings
 */
export function useSettingsConfig() {
    const context = useContext(SettingsConfigContext)
    if (context === undefined) {
        // During HMR, the context may temporarily be undefined
        if (import.meta.hot) {
            console.warn('[SettingsConfigContext] Context undefined during HMR, using defaults')
            return {
                settingsConfig: defaultSettingsConfig,
                updateSettingsConfig: () => {},
            }
        }
        throw new Error('useSettingsConfig must be used within a SettingsConfigProvider')
    }
    return context
}

export { SettingsConfigContext }
