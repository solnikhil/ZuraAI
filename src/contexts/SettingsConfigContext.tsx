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
import type { ProviderId } from '../providers/providerTypes'
import { warnOnceDuringHmr } from './hmrWarnings'

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

type ProviderKey = ProviderId
type ProviderEnabledMap = Partial<Record<ProviderKey, boolean>>
export type TavilySearchDepth = 'ultra-fast' | 'fast' | 'basic' | 'advanced'
export type TavilySearchDepthPreference = 'auto' | TavilySearchDepth

export interface OverlaySettings {
  enabled: boolean
  launchOnStartup: boolean
  hotkey: string
  anchor: 'right'
  compactWidth: number
  expandedWidth: number
  promptAutoHideEnabled: boolean
  promptAutoHideTimeout: number
}

/**
 * Configuration-related settings that change infrequently
 */
export interface SettingsConfig {
  // API Keys
  openRouterApiKey: string
  openRouterDebug: boolean
  perplexityApiKey: string
  groqApiKey: string
  tavilyApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  alibabaApiKey: string
  fireworksApiKey: string

  // Model settings
  aiModel: string
  modelProvider: ProviderId
  providerEnabled?: ProviderEnabledMap
  configuredModels: ConfiguredModel[]
  ollamaUrl: string
  ollamaModels: ConfiguredModel[]
  perplexityModels: ConfiguredModel[]
  groqModels: ConfiguredModel[]
  alibabaModels: ConfiguredModel[]
  fireworksModels: ConfiguredModel[]

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
  titleModelProvider: ProviderId
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
  overlay: OverlaySettings
}

/**
 * Default configuration settings
 */
export const defaultSettingsConfig: SettingsConfig = {
  // API Keys
  openRouterApiKey: '',
  openRouterDebug: false,
  perplexityApiKey: '',
  groqApiKey: '',
  tavilyApiKey: '',
  tavilySearchDepthPreference: 'auto',
  webSearchIncludeImages: true,
  alibabaApiKey: '',
  fireworksApiKey: '',

  // Model settings
  aiModel: '',
  modelProvider: 'openrouter',
  providerEnabled: {
    alibaba: true,
    fireworks: true,
    groq: true,
    ollama: true,
    openrouter: true,
    perplexity: true,
  },
  configuredModels: [],
  ollamaUrl: 'http://localhost:11434',
  ollamaModels: [],
  perplexityModels: [
    { code: 'sonar', displayName: 'Sonar', maxContext: 128000, supportsWebSearch: true },
    {
      code: 'sonar-pro',
      displayName: 'Sonar Pro',
      maxContext: 128000,
      supportsWebSearch: true,
    },
    {
      code: 'sonar-reasoning-pro',
      displayName: 'Sonar Reasoning Pro',
      maxContext: 128000,
      modelType: 'reasoning',
      supportsDeepThinking: true,
      supportsWebSearch: true,
    },
    {
      code: 'sonar-deep-research',
      displayName: 'Sonar Deep Research',
      maxContext: 128000,
      modelType: 'reasoning',
      supportsDeepThinking: true,
      supportsWebSearch: true,
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
  alibabaModels: [],
  fireworksModels: [
    // Tier 1: Essential Flagship Models
    {
      code: 'accounts/fireworks/models/deepseek-v3p2',
      displayName: 'DeepSeek V3.2',
      enabled: true,
      maxContext: 163840,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: false,
      modelType: 'chat',
      description: 'Best price-to-performance, MoE architecture, efficient reasoning',
    },
    {
      code: 'accounts/fireworks/models/kimi-k2p5',
      displayName: 'Kimi K2.5',
      enabled: true,
      maxContext: 262144,
      supportsToolCall: true,
      supportsVision: true,
      supportsDeepThinking: true,
      modelType: 'chat',
      description: '1T params, unified vision+text, thinking/non-thinking modes, agentic SOTA',
    },
    {
      code: 'accounts/fireworks/routers/kimi-k2p5-turbo',
      displayName: 'Kimi K2.5 Turbo',
      enabled: true,
      maxContext: 262144,
      supportsToolCall: true,
      supportsVision: true,
      supportsDeepThinking: true,
      modelType: 'chat',
      description:
        'Full-access Fireworks router for Kimi K2.5 Turbo via the OpenAI-compatible inference API',
    },
    {
      code: 'accounts/fireworks/models/deepseek-r1',
      displayName: 'DeepSeek R1',
      enabled: true,
      maxContext: 163840,
      supportsToolCall: false,
      supportsVision: false,
      supportsDeepThinking: true,
      modelType: 'reasoning',
      description: '671B MoE, 97.3% MATH-500, advanced reasoning & chain-of-thought',
    },
    {
      code: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      displayName: 'Llama 3.1 405B',
      enabled: true,
      maxContext: 131072,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: false,
      modelType: 'chat',
      description: 'Meta flagship, 410B params, multilingual, strong generalist',
    },
    // Tier 2: Efficient & Balanced
    {
      code: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      displayName: 'Llama 3.1 8B',
      enabled: true,
      maxContext: 131072,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: false,
      modelType: 'chat',
      description: 'Fast inference, low cost, great for quick tasks & RAG',
    },
    {
      code: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
      displayName: 'Llama 3.1 70B',
      enabled: true,
      maxContext: 131072,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: false,
      modelType: 'chat',
      description: 'Balanced performance/cost for production workloads',
    },
    // Tier 3: Specialized & Advanced
    {
      code: 'accounts/fireworks/models/glm-5',
      displayName: 'GLM-5',
      enabled: true,
      maxContext: 202752,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: true,
      modelType: 'chat',
      description: '744B MoE (40B active), Z.ai flagship, advanced coding, long-horizon agents',
    },
    {
      code: 'accounts/fireworks/models/qwen3-235b-a22b',
      displayName: 'Qwen3 235B',
      enabled: true,
      maxContext: 131072,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: true,
      modelType: 'chat',
      description: '235B MoE (22B active), multilingual, coding, dual-mode reasoning',
    },
    {
      code: 'accounts/fireworks/models/glm-4p7',
      displayName: 'GLM-4.7',
      enabled: true,
      maxContext: 202752,
      supportsToolCall: true,
      supportsVision: false,
      supportsDeepThinking: true,
      modelType: 'chat',
      description: 'Cost-effective alternative to GLM-5, strong coding & reasoning',
    },
    {
      code: 'accounts/fireworks/models/nvidia-nemotron-3-super-120b-a12b-fp8',
      displayName: 'NVIDIA Nemotron 3',
      enabled: true,
      maxContext: 262144,
      supportsToolCall: false,
      supportsVision: false,
      supportsDeepThinking: false,
      modelType: 'chat',
      description: '120B hybrid MoE, 7 languages, fast generation with MTP',
    },
  ],

  // AI parameters
  temperature: 0.7,
  maxTokens: 8000,
  systemPrompt: defaultSystemPrompt,
  webSearchPrompt: defaultWebSearchPrompt,
  streamResponses: true,

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
  overlay: {
    enabled: false,
    launchOnStartup: false,
    hotkey: 'CommandOrControl+Shift+/',
    anchor: 'right',
    compactWidth: 360,
    expandedWidth: 460,
    promptAutoHideEnabled: false,
    promptAutoHideTimeout: 120,
  },
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

  // Load API keys from secure storage on startup
  useEffect(() => {
    const loadSecureKeys = async () => {
      try {
        // Migrate existing keys from localStorage if needed
        await migrateApiKeysFromLocalStorage({
          alibabaApiKey: settingsConfig.alibabaApiKey,
          fireworksApiKey: settingsConfig.fireworksApiKey,
          groqApiKey: settingsConfig.groqApiKey,
          openRouterApiKey: settingsConfig.openRouterApiKey,
          perplexityApiKey: settingsConfig.perplexityApiKey,
          tavilyApiKey: settingsConfig.tavilyApiKey,
        })

        // Load from secure storage (single IPC roundtrip via getAll)
        const secureKeys = await loadApiKeysFromSecureStorage()

        // Check if we got any keys
        const hasSecureKeys =
          secureKeys.alibabaApiKey ||
          secureKeys.fireworksApiKey ||
          secureKeys.groqApiKey ||
          secureKeys.openRouterApiKey ||
          secureKeys.perplexityApiKey ||
          secureKeys.tavilyApiKey

        if (hasSecureKeys) {
          // Update settings with secure keys - prefer secure storage values
          setSettingsConfig((prev) => ({
            ...prev,
            alibabaApiKey: secureKeys.alibabaApiKey || prev.alibabaApiKey,
            fireworksApiKey: secureKeys.fireworksApiKey || prev.fireworksApiKey,
            groqApiKey: secureKeys.groqApiKey || prev.groqApiKey,
            openRouterApiKey: secureKeys.openRouterApiKey || prev.openRouterApiKey,
            perplexityApiKey: secureKeys.perplexityApiKey || prev.perplexityApiKey,
            tavilyApiKey: secureKeys.tavilyApiKey || prev.tavilyApiKey,
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
      warnOnceDuringHmr(
        'SettingsConfigContext',
        '[SettingsConfigContext] Context undefined during HMR, using defaults'
      )
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
