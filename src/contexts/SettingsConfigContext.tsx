/**
 * SettingsConfigContext - Context for stable configuration settings
 * 
 * This context contains settings that change infrequently:
 * - API keys for various providers
 * - Model configurations
 * - AI parameters (temperature, maxTokens, systemPrompt)
 * - Tool settings
 * - User preferences (remember settings)
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

export interface ConfiguredModel {
    code: string
    displayName: string
    enabled?: boolean
    description?: string
    maxContext?: number
    extendedParameters?: string[]
    modelType?: 'chat' | 'reasoning' | 'image' | 'video' | 'embedding' | 'other'
    supportsToolCall?: boolean
    supportsVision?: boolean
    supportsDeepThinking?: boolean
    supportsWebSearch?: boolean
    supportsImageGeneration?: boolean
    supportsVideoRecognition?: boolean
}

/**
 * Configuration-related settings that change infrequently
 */
export interface SettingsConfig {
    // API Keys
    openRouterApiKey: string
    perplexityApiKey: string
    groqApiKey: string
    tavilyApiKey: string
    nvidiaApiKey: string

    // Model settings
    aiModel: string
    modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'groq' | 'nvidia'
    configuredModels: ConfiguredModel[]
    ollamaUrl: string
    ollamaModels: ConfiguredModel[]
    perplexityModels: ConfiguredModel[]
    groqModels: ConfiguredModel[]
    nvidiaModels: ConfiguredModel[]

    // AI parameters
    temperature: number
    maxTokens: number
    systemPrompt: string
    streamResponses: boolean
    
    // Tool settings
    toolsEnabled: boolean
    enabledTools: string[]
    webSearchEnabled: boolean
    /** Step-by-step research: plan → execute web searches → synthesize */
    structuredResearchEnabled: boolean
    
    // Title generation
    titleModel: string
    
    // Favorites
    favoriteModels: string[]
    
    // Quick prompts
    quickPrompts: string[]
    
    // Todos
    todos: TodoItem[]
    
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
    groqApiKey: '',
    tavilyApiKey: '',
    nvidiaApiKey: '',

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
        { code: 'sonar', displayName: 'Sonar', maxContext: 200000 },
        { code: 'sonar-pro', displayName: 'Sonar Pro', maxContext: 200000 },
        { code: 'sonar-reasoning', displayName: 'Sonar Reasoning', maxContext: 200000 },
        { code: 'sonar-reasoning-pro', displayName: 'Sonar Reasoning Pro', maxContext: 200000 },
        { code: 'sonar-deep-research', displayName: 'Sonar Deep Research', maxContext: 200000 },
        // Llama 3.1 Sonar Variants (128k Context)
        { code: 'llama-3.1-sonar-small-128k-online', displayName: 'Llama 3.1 Sonar Small 128k Online', maxContext: 131072 },
        { code: 'llama-3.1-sonar-medium-128k-online', displayName: 'Llama 3.1 Sonar Medium 128k Online', maxContext: 131072 },
        { code: 'llama-3.1-sonar-large-128k-online', displayName: 'Llama 3.1 Sonar Large 128k Online', maxContext: 131072 },
        { code: 'llama-3.1-sonar-huge-128k-online', displayName: 'Llama 3.1 Sonar Huge 128k Online', maxContext: 131072 },
    ],
    groqModels: [
        // Production Models (enabled: most famous)
        { code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', enabled: true, maxContext: 131072 },
        { code: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B Versatile', enabled: true, maxContext: 131072 },
        { code: 'openai/gpt-oss-120b', displayName: 'GPT OSS 120B', enabled: true, maxContext: 131072 },
        { code: 'openai/gpt-oss-20b', displayName: 'GPT OSS 20B', enabled: true, maxContext: 131072 },
        // Production Systems (enabled)
        { code: 'groq/compound', displayName: 'Groq Compound', enabled: true, maxContext: 131072 },
        { code: 'groq/compound-mini', displayName: 'Groq Compound Mini', enabled: true, maxContext: 131072 },
        // Preview Models (enabled: well-known)
        { code: 'meta-llama/llama-4-scout-17b-16e-instruct', displayName: 'Llama 4 Scout 17B', enabled: true, maxContext: 131072 },
        { code: 'qwen/qwen3-32b', displayName: 'Qwen3 32B', enabled: true, maxContext: 131072 },
        { code: 'moonshotai/kimi-k2-instruct-0905', displayName: 'Kimi K2', enabled: true, maxContext: 262144 },
        // Preview Models (disabled: less known)
        { code: 'meta-llama/llama-4-maverick-17b-128e-instruct', displayName: 'Llama 4 Maverick 17B', enabled: false, maxContext: 131072 },
        { code: 'openai/gpt-oss-safeguard-20b', displayName: 'GPT OSS Safeguard 20B', enabled: false, maxContext: 131072 },
    ],
    nvidiaModels: [
        // Meta (well-known)
        { code: 'meta/llama3-70b', displayName: 'Llama 3 70B', enabled: true, maxContext: 8192 },
        { code: 'meta/llama3-8b', displayName: 'Llama 3 8B', enabled: true, maxContext: 8192 },
        { code: 'meta/llama2-70b', displayName: 'Llama 2 70B', enabled: false, maxContext: 4096 },
        { code: 'meta/codellama-70b', displayName: 'Code Llama 70B', enabled: false, maxContext: 16384 },
        // NVIDIA (well-known)
        { code: 'nvidia/nemotron-4-340b-instruct', displayName: 'Nemotron 4 340B', enabled: true, maxContext: 4096 },
        { code: 'nvidia/llama3-chatqa-1.5-70b', displayName: 'Llama 3 ChatQA 1.5 70B', enabled: true, maxContext: 8192 },
        { code: 'nvidia/llama3-chatqa-1.5-8b', displayName: 'Llama 3 ChatQA 1.5 8B', enabled: false, maxContext: 8192 },
        // Mistral (well-known)
        { code: 'mistralai/mistral-large', displayName: 'Mistral Large', enabled: true, maxContext: 128000 },
        { code: 'mistralai/mistral-large-2-instruct', displayName: 'Mistral Large 2', enabled: true, maxContext: 128000 },
        { code: 'mistralai/mixtral-8x7b-instruct', displayName: 'Mixtral 8x7B', enabled: true, maxContext: 32768 },
        { code: 'mistralai/mixtral-8x22b-instruct', displayName: 'Mixtral 8x22B', enabled: false, maxContext: 65536 },
        { code: 'mistralai/mistral-7b-instruct', displayName: 'Mistral 7B', enabled: false, maxContext: 32768 },
        { code: 'mistralai/mistral-7b-instruct-v0.3', displayName: 'Mistral 7B v0.3', enabled: false, maxContext: 32768 },
        { code: 'mistralai/codestral-22b-instruct-v0.1', displayName: 'Codestral 22B', enabled: false, maxContext: 32768 },
        { code: 'mistralai/mathstral-7b-v0.1', displayName: 'Mathstral 7B', enabled: false, maxContext: 32768 },
        // Google (well-known: Gemma 2 9B)
        { code: 'google/gemma-2b', displayName: 'Gemma 2B', enabled: false, maxContext: 8192 },
        { code: 'google/gemma-7b', displayName: 'Gemma 7B', enabled: false, maxContext: 8192 },
        { code: 'google/gemma-2-2b-it', displayName: 'Gemma 2 2B IT', enabled: false, maxContext: 8192 },
        { code: 'google/gemma-2-9b-it', displayName: 'Gemma 2 9B IT', enabled: true, maxContext: 8192 },
        { code: 'google/gemma-2-27b-it', displayName: 'Gemma 2 27B IT', enabled: false, maxContext: 8192 },
        { code: 'google/codegemma-1.1-7b', displayName: 'CodeGemma 1.1 7B', enabled: false, maxContext: 8192 },
        { code: 'google/codegemma-7b', displayName: 'CodeGemma 7B', enabled: false, maxContext: 8192 },
        { code: 'google/recurrentgemma-2b', displayName: 'RecurrentGemma 2B', enabled: false, maxContext: 8192 },
        { code: 'google/shieldgemma-9b', displayName: 'ShieldGemma 9B', enabled: false, maxContext: 8192 },
        // Microsoft (well-known: Phi-3 Medium 4K)
        { code: 'microsoft/phi-3-medium-4k-instruct', displayName: 'Phi-3 Medium 4K', enabled: true, maxContext: 4096 },
        { code: 'microsoft/phi-3-medium-128k-instruct', displayName: 'Phi-3 Medium 128K', enabled: false, maxContext: 131072 },
        { code: 'microsoft/phi-3-mini-4k-instruct', displayName: 'Phi-3 Mini 4K', enabled: false, maxContext: 4096 },
        { code: 'microsoft/phi-3-mini-128k-instruct', displayName: 'Phi-3 Mini 128K', enabled: false, maxContext: 131072 },
        { code: 'microsoft/phi-3-small-8k-instruct', displayName: 'Phi-3 Small 8K', enabled: false, maxContext: 8192 },
        { code: 'microsoft/phi-3-small-128k-instruct', displayName: 'Phi-3 Small 128K', enabled: false, maxContext: 131072 },
        // DeepSeek (well-known)
        { code: 'deepseek-ai/deepseek-r1', displayName: 'DeepSeek R1', enabled: true, maxContext: 64000 },
        // Snowflake (well-known)
        { code: 'snowflake/arctic', displayName: 'Snowflake Arctic', enabled: false, maxContext: 4096 },
        // GLM / Zhipu (well-known: GLM 4.7)
        { code: 'z-ai/glm4.7', displayName: 'GLM 4.7', enabled: false, maxContext: 131072 },
        { code: 'thudm/chatglm3-6b', displayName: 'ChatGLM3 6B', enabled: false, maxContext: 8192 },
        // MiniMax (well-known)
        { code: 'minimaxai/minimax-m2', displayName: 'MiniMax M2', enabled: false, maxContext: 128000 },
        // Kimi / Moonshot (well-known: K2.5)
        { code: 'moonshotai/kimi-k2-5', displayName: 'Kimi K2.5', enabled: false, maxContext: 262144 },
        { code: 'moonshotai/kimi-k2-instruct', displayName: 'Kimi K2 Instruct', enabled: false, maxContext: 131072 },
        { code: 'moonshotai/kimi-k2-instruct-0905', displayName: 'Kimi K2 Instruct 0905', enabled: false, maxContext: 262144 },
        // Others (disabled by default)
        { code: '01-ai/yi-large', displayName: 'Yi Large', enabled: false, maxContext: 4096 },
        { code: 'abacusai/dracarys-llama-3.1-70b-instruct', displayName: 'Dracarys Llama 3.1 70B', enabled: false, maxContext: 8192 },
        { code: 'aisingapore/sea-lion-7b-instruct', displayName: 'Sea-Lion 7B', enabled: false, maxContext: 4096 },
        { code: 'databricks/dbrx-instruct', displayName: 'DBRX Instruct', enabled: false, maxContext: 32768 },
        { code: 'ibm/granite-34b-code-instruct', displayName: 'Granite 34B Code', enabled: false, maxContext: 8192 },
        { code: 'ibm/granite-8b-code-instruct', displayName: 'Granite 8B Code', enabled: false, maxContext: 8192 },
        { code: 'mediatek/breeze-7b-instruct', displayName: 'Breeze 7B', enabled: false, maxContext: 4096 },
        { code: 'qwen/qwen2-7b-instruct', displayName: 'Qwen2 7B', enabled: false, maxContext: 32768 },
        { code: 'rakuten/rakutenai-7b-chat', displayName: 'Rakuten AI 7B Chat', enabled: false, maxContext: 4096 },
        { code: 'rakuten/rakutenai-7b-instruct', displayName: 'Rakuten AI 7B Instruct', enabled: false, maxContext: 4096 },
        { code: 'seallms/seallm-7b-v2.5', displayName: 'SEALLM 7B v2.5', enabled: false, maxContext: 4096 },
        { code: 'upstage/solar-10.7b-instruct', displayName: 'Solar 10.7B', enabled: false, maxContext: 4096 },
        { code: 'bigcode/starcoder2-7b', displayName: 'StarCoder2 7B', enabled: false, maxContext: 16384 },
        { code: 'bigcode/starcoder2-15b', displayName: 'StarCoder2 15B', enabled: false, maxContext: 16384 },
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
    structuredResearchEnabled: false,
    
    // Title generation
    titleModel: 'google/gemini-2.0-flash-exp:free',
    
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
                    groqApiKey: settingsConfig.groqApiKey,
                    tavilyApiKey: settingsConfig.tavilyApiKey,
                    nvidiaApiKey: settingsConfig.nvidiaApiKey,
                })

                // Load from secure storage
                const secureKeys = await loadApiKeysFromSecureStorage()

                // Check if we got any keys
                const hasSecureKeys = secureKeys.openRouterApiKey || secureKeys.perplexityApiKey ||
                    secureKeys.groqApiKey || secureKeys.tavilyApiKey || secureKeys.nvidiaApiKey

                if (hasSecureKeys) {
                    // Update settings with secure keys - prefer secure storage values
                    setSettingsConfig(prev => ({
                        ...prev,
                        openRouterApiKey: secureKeys.openRouterApiKey || prev.openRouterApiKey,
                        perplexityApiKey: secureKeys.perplexityApiKey || prev.perplexityApiKey,
                        groqApiKey: secureKeys.groqApiKey || prev.groqApiKey,
                        tavilyApiKey: secureKeys.tavilyApiKey || prev.tavilyApiKey,
                        nvidiaApiKey: secureKeys.nvidiaApiKey || prev.nvidiaApiKey,
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
