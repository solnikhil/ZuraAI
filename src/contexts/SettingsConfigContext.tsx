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
 *   values (theme, UI state) and stable values (API keys, model configs)
 *
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import {
  checkOllamaStatus,
  listOllamaModels,
  enrichOllamaModelsWithContext,
} from '../services/ollama'
import {
  loadApiKeysFromSecureStorage,
  migrateApiKeysFromLocalStorage,
} from '../utils/secureApiKeys'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'
import { defaultWebSearchPrompt } from '../prompts/defaultWebSearchPrompt'
import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import { defaultSkillsSettings, type SkillsSettings } from '../skills'

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
  inputModalities?: string[]
  outputModalities?: string[]
  modelType?: 'chat' | 'reasoning' | 'image' | 'video' | 'embedding' | 'other'
  supportsToolCall?: boolean
  supportsVision?: boolean
  supportsDeepThinking?: boolean
  supportsWebSearch?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
}

type ProviderKey = 'openrouter' | 'ollama' | 'perplexity' | 'groq' | 'alibaba'
type ProviderEnabledMap = Partial<Record<ProviderKey, boolean>>

/**
 * Configuration-related settings that change infrequently
 */
export interface SettingsConfig {
  // API Keys
  openRouterApiKey: string
  perplexityApiKey: string
  groqApiKey: string
  tavilyApiKey: string
  alibabaApiKey: string

  // Model settings
  aiModel: string
  modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'groq' | 'alibaba'
  providerEnabled?: ProviderEnabledMap
  configuredModels: ConfiguredModel[]
  ollamaUrl: string
  ollamaModels: ConfiguredModel[]
  perplexityModels: ConfiguredModel[]
  groqModels: ConfiguredModel[]
  alibabaModels: ConfiguredModel[]

  // AI parameters
  temperature: number
  maxTokens: number
  systemPrompt: string
  /** Web search instructions appended when Web Search is enabled */
  webSearchPrompt: string
  streamResponses: boolean

  // Tool settings
  toolsEnabled: boolean
  enabledTools: string[]
  skills: SkillsSettings
  /** @deprecated Legacy migration input only; do not use in runtime logic. */
  webSearchEnabled?: boolean
  /** @deprecated Legacy migration input only; do not use in runtime logic. */
  structuredResearchEnabled?: boolean

  // Title generation
  titleModelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'groq' | 'alibaba'
  titleModel: string
  titleGenerationPrompt: string
  titleGenerationDisplayMode: 'instant' | 'typewriter'

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
  alibabaApiKey: '',

  // Model settings
  aiModel: '',
  modelProvider: 'openrouter',
  providerEnabled: {
    openrouter: true,
    ollama: true,
    perplexity: true,
    groq: true,
    alibaba: true,
  },
  configuredModels: [],
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
    {
      code: 'llama-3.1-sonar-small-128k-online',
      displayName: 'Llama 3.1 Sonar Small 128k Online',
      maxContext: 131072,
    },
    {
      code: 'llama-3.1-sonar-medium-128k-online',
      displayName: 'Llama 3.1 Sonar Medium 128k Online',
      maxContext: 131072,
    },
    {
      code: 'llama-3.1-sonar-large-128k-online',
      displayName: 'Llama 3.1 Sonar Large 128k Online',
      maxContext: 131072,
    },
    {
      code: 'llama-3.1-sonar-huge-128k-online',
      displayName: 'Llama 3.1 Sonar Huge 128k Online',
      maxContext: 131072,
    },
  ],
  groqModels: [
    // Production Models (enabled: most famous)
    {
      code: 'llama-3.1-8b-instant',
      displayName: 'Llama 3.1 8B Instant',
      enabled: true,
      maxContext: 131072,
    },
    {
      code: 'llama-3.3-70b-versatile',
      displayName: 'Llama 3.3 70B Versatile',
      enabled: true,
      maxContext: 131072,
    },
    { code: 'openai/gpt-oss-120b', displayName: 'GPT OSS 120B', enabled: true, maxContext: 131072 },
    { code: 'openai/gpt-oss-20b', displayName: 'GPT OSS 20B', enabled: true, maxContext: 131072 },
    // Production Systems (enabled)
    { code: 'groq/compound', displayName: 'Groq Compound', enabled: true, maxContext: 131072 },
    {
      code: 'groq/compound-mini',
      displayName: 'Groq Compound Mini',
      enabled: true,
      maxContext: 131072,
    },
    // Preview Models (enabled: well-known)
    {
      code: 'meta-llama/llama-4-scout-17b-16e-instruct',
      displayName: 'Llama 4 Scout 17B',
      enabled: true,
      maxContext: 131072,
    },
    { code: 'qwen/qwen3-32b', displayName: 'Qwen3 32B', enabled: true, maxContext: 131072 },
    {
      code: 'moonshotai/kimi-k2-instruct-0905',
      displayName: 'Kimi K2',
      enabled: true,
      maxContext: 262144,
    },
    // Preview Models (disabled: less known)
    {
      code: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      displayName: 'Llama 4 Maverick 17B',
      enabled: false,
      maxContext: 131072,
    },
    {
      code: 'openai/gpt-oss-safeguard-20b',
      displayName: 'GPT OSS Safeguard 20B',
      enabled: false,
      maxContext: 131072,
    },
  ],
  alibabaModels: [
    // === Commercial (enabled) ===
    { code: 'qwen3-max', displayName: 'Qwen3 Max', enabled: true, maxContext: 128000 },
    {
      code: 'qwen3-max-preview',
      displayName: 'Qwen3 Max Preview',
      enabled: true,
      maxContext: 128000,
    },
    { code: 'qwen-max', displayName: 'Qwen Max', enabled: true, maxContext: 128000 },
    { code: 'qwen3.5-plus', displayName: 'Qwen3.5 Plus', enabled: true, maxContext: 128000 },
    { code: 'qwen-plus', displayName: 'Qwen Plus', enabled: true, maxContext: 128000 },
    { code: 'qwen-flash', displayName: 'Qwen Flash', enabled: true, maxContext: 128000 },
    { code: 'qwen-turbo', displayName: 'Qwen Turbo', enabled: true, maxContext: 128000 },
    { code: 'qwq-plus', displayName: 'QwQ Plus', enabled: true, maxContext: 128000 },
    // Qwen-Coder (specialized)
    {
      code: 'qwen3-coder-plus',
      displayName: 'Qwen3 Coder Plus',
      enabled: true,
      maxContext: 128000,
    },
    {
      code: 'qwen3-coder-flash',
      displayName: 'Qwen3 Coder Flash',
      enabled: true,
      maxContext: 128000,
    },
    // === Thinking models (enabled) ===
    {
      code: 'qwen3-next-80b-a3b-thinking',
      displayName: 'Qwen3-Next 80B Thinking',
      enabled: true,
      maxContext: 262000,
    },
    {
      code: 'qwen3-next-80b-a3b-instruct',
      displayName: 'Qwen3-Next 80B Instruct',
      enabled: true,
      maxContext: 262000,
    },
    {
      code: 'qwen3-235b-a22b-thinking-2507',
      displayName: 'Qwen3 235B Thinking',
      enabled: true,
      maxContext: 131072,
    },
    {
      code: 'qwen3-235b-a22b-instruct-2507',
      displayName: 'Qwen3 235B Instruct',
      enabled: true,
      maxContext: 131072,
    },
    {
      code: 'qwen3-30b-a3b-thinking-2507',
      displayName: 'Qwen3 30B Thinking',
      enabled: true,
      maxContext: 131072,
    },
    {
      code: 'qwen3-30b-a3b-instruct-2507',
      displayName: 'Qwen3 30B Instruct',
      enabled: true,
      maxContext: 131072,
    },
    { code: 'qwen3.5-397b-a17b', displayName: 'Qwen3.5 397B', enabled: true, maxContext: 131072 },
    // === Open source (enabled) ===
    { code: 'qwen3-235b-a22b', displayName: 'Qwen3 235B', enabled: true, maxContext: 131072 },
    { code: 'qwen3-32b', displayName: 'Qwen3 32B', enabled: true, maxContext: 32768 },
    { code: 'qwen3-30b-a3b', displayName: 'Qwen3 30B', enabled: true, maxContext: 32768 },
    { code: 'qwen3-14b', displayName: 'Qwen3 14B', enabled: true, maxContext: 32768 },
    { code: 'qwen3-8b', displayName: 'Qwen3 8B', enabled: true, maxContext: 32768 },
    { code: 'qwen2.5-72b-instruct', displayName: 'Qwen2.5 72B', enabled: true, maxContext: 131072 },
    { code: 'qwen2.5-32b-instruct', displayName: 'Qwen2.5 32B', enabled: true, maxContext: 32768 },
    { code: 'qwen2.5-14b-instruct', displayName: 'Qwen2.5 14B', enabled: true, maxContext: 32768 },
    {
      code: 'qwen2.5-14b-instruct-1m',
      displayName: 'Qwen2.5 14B 1M',
      enabled: true,
      maxContext: 1000000,
    },
    { code: 'qwen2.5-7b-instruct', displayName: 'Qwen2.5 7B', enabled: true, maxContext: 32768 },
    {
      code: 'qwen2.5-7b-instruct-1m',
      displayName: 'Qwen2.5 7B 1M',
      enabled: true,
      maxContext: 1000000,
    },
    // === Least popular (disabled) ===
    { code: 'qwen3-4b', displayName: 'Qwen3 4B', enabled: false, maxContext: 8192 },
    { code: 'qwen3-1.7b', displayName: 'Qwen3 1.7B', enabled: false, maxContext: 4096 },
    { code: 'qwen3-0.6b', displayName: 'Qwen3 0.6B', enabled: false, maxContext: 4096 },
    { code: 'qwen2.5-3b-instruct', displayName: 'Qwen2.5 3B', enabled: false, maxContext: 32768 },
    {
      code: 'qwen2.5-1.5b-instruct',
      displayName: 'Qwen2.5 1.5B',
      enabled: false,
      maxContext: 4096,
    },
    {
      code: 'qwen2.5-0.5b-instruct',
      displayName: 'Qwen2.5 0.5B',
      enabled: false,
      maxContext: 4096,
    },
    // Snapshot / regional variants (disabled)
    {
      code: 'qwen3-max-2025-09-23',
      displayName: 'Qwen3 Max (2025-09-23)',
      enabled: false,
      maxContext: 128000,
    },
    {
      code: 'qwen-plus-latest',
      displayName: 'Qwen Plus Latest',
      enabled: false,
      maxContext: 128000,
    },
    {
      code: 'qwen-plus-2025-01-25',
      displayName: 'Qwen Plus (2025-01-25)',
      enabled: false,
      maxContext: 128000,
    },
    { code: 'qwen-max-latest', displayName: 'Qwen Max Latest', enabled: false, maxContext: 128000 },
    {
      code: 'qwen-max-2025-01-25',
      displayName: 'Qwen Max (2025-01-25)',
      enabled: false,
      maxContext: 128000,
    },
    {
      code: 'qwen-flash-2025-07-28',
      displayName: 'Qwen Flash (2025-07-28)',
      enabled: false,
      maxContext: 128000,
    },
    {
      code: 'qwen-turbo-latest',
      displayName: 'Qwen Turbo Latest',
      enabled: false,
      maxContext: 128000,
    },
    {
      code: 'qwen-turbo-2024-11-01',
      displayName: 'Qwen Turbo (2024-11-01)',
      enabled: false,
      maxContext: 128000,
    },
    {
      code: 'qwen3.5-plus-2026-02-15',
      displayName: 'Qwen3.5 Plus (2026-02-15)',
      enabled: false,
      maxContext: 128000,
    },
    { code: 'qwen-plus-us', displayName: 'Qwen Plus US', enabled: false, maxContext: 128000 },
    { code: 'qwen-flash-us', displayName: 'Qwen Flash US', enabled: false, maxContext: 128000 },
  ],

  // AI parameters
  temperature: 0.7,
  maxTokens: 8000,
  systemPrompt: defaultSystemPrompt,
  webSearchPrompt: defaultWebSearchPrompt,
  streamResponses: false,

  // Tool settings
  toolsEnabled: true,
  enabledTools: ['web_search'],
  skills: defaultSkillsSettings,

  // Title generation
  titleModelProvider: 'openrouter',
  titleModel: '',
  titleGenerationPrompt: defaultTitleGenerationPrompt,
  titleGenerationDisplayMode: 'instant',

  // Favorites
  favoriteModels: [],

  // Quick prompts
  quickPrompts: [
    'Explain this code to me',
    'Help me debug an error',
    'Write a summary of...',
    'Brainstorm ideas for...',
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
  /** True once API keys have been loaded from secure storage (or load failed/skipped) */
  isSecureStorageLoaded: boolean
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
  onSettingsChange,
}: SettingsConfigProviderProps) {
  const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>(() => {
    return { ...defaultSettingsConfig, ...initialSettings }
  })
  const [isSecureStorageLoaded, setIsSecureStorageLoaded] = useState(false)

  // Sync with parent when initialSettings change (e.g., from storage events)
  useEffect(() => {
    if (initialSettings) {
      setSettingsConfig((prev) => ({ ...prev, ...initialSettings }))
    }
  }, [initialSettings])

  // Migration: expand Alibaba models if user has cached old list (missing new models)
  useEffect(() => {
    const current = settingsConfig.alibabaModels ?? []
    const defaultList = defaultSettingsConfig.alibabaModels
    const needsExpansion = current.length < defaultList.length
    if (needsExpansion && defaultList.length > 0) {
      const merged = defaultList.map((d) => {
        const existing = current.find((m) => m.code === d.code)
        return existing ? { ...d, enabled: existing.enabled ?? d.enabled } : d
      })
      const defaultCodes = new Set(defaultList.map((d) => d.code))
      const custom = current.filter((m) => !defaultCodes.has(m.code))
      const expanded = [...merged, ...custom]
      setSettingsConfig((prev) => ({ ...prev, alibabaModels: expanded }))
    }
  }, []) // Run once on mount

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
          alibabaApiKey: settingsConfig.alibabaApiKey,
        })

        // Load from secure storage (single IPC roundtrip via getAll)
        const secureKeys = await loadApiKeysFromSecureStorage()

        // Check if we got any keys
        const hasSecureKeys =
          secureKeys.openRouterApiKey ||
          secureKeys.perplexityApiKey ||
          secureKeys.groqApiKey ||
          secureKeys.tavilyApiKey ||
          secureKeys.alibabaApiKey

        if (hasSecureKeys) {
          // Update settings with secure keys - prefer secure storage values
          setSettingsConfig((prev) => ({
            ...prev,
            openRouterApiKey: secureKeys.openRouterApiKey || prev.openRouterApiKey,
            perplexityApiKey: secureKeys.perplexityApiKey || prev.perplexityApiKey,
            groqApiKey: secureKeys.groqApiKey || prev.groqApiKey,
            tavilyApiKey: secureKeys.tavilyApiKey || prev.tavilyApiKey,
            alibabaApiKey: secureKeys.alibabaApiKey || prev.alibabaApiKey,
          }))
        }
      } catch (error) {
        console.error('[SettingsConfigContext] Failed to load API keys from secure storage:', error)
      } finally {
        // Always mark as loaded so the app doesn't hang, even on error
        setIsSecureStorageLoaded(true)
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
            const formatted = models.map((m) => ({
              code: m.name,
              displayName: `${m.name} (${m.details.parameter_size})`,
            }))
            const enriched = await enrichOllamaModelsWithContext(
              settingsConfig.ollamaUrl,
              formatted
            )
            setSettingsConfig((prev) => ({ ...prev, ollamaModels: enriched }))
          }
        }
      } catch {
        /* Ollama not available */
      }
    }
    fetchOllamaModels()
  }, [])

  // Notify parent of changes
  useEffect(() => {
    onSettingsChange?.(settingsConfig)
  }, [settingsConfig, onSettingsChange])

  const updateSettingsConfig = useCallback((newSettings: Partial<SettingsConfig>) => {
    setSettingsConfig((prev) => ({ ...prev, ...newSettings }))
  }, [])

  const contextValue = useMemo(
    () => ({
      settingsConfig,
      updateSettingsConfig,
      isSecureStorageLoaded,
    }),
    [settingsConfig, updateSettingsConfig, isSecureStorageLoaded]
  )

  // Loading gate: don't render children until secure storage keys are loaded.
  // This prevents the flash of empty API keys that made providers appear disabled.
  if (!isSecureStorageLoaded) {
    return null
  }

  return (
    <SettingsConfigContext.Provider value={contextValue}>{children}</SettingsConfigContext.Provider>
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
        isSecureStorageLoaded: true,
      }
    }
    throw new Error('useSettingsConfig must be used within a SettingsConfigProvider')
  }
  return context
}

export { SettingsConfigContext }
