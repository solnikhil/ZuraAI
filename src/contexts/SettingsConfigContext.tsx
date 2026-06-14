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
  loadApiKeyPresenceFromSecureStorage,
  migrateApiKeysFromLocalStorage,
} from '../utils/secureApiKeys'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'
import { defaultWebSearchPrompt } from '../prompts/defaultWebSearchPrompt'
import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import { defaultCodeExecutionPrompt } from '../prompts/defaultCodeExecutionPrompt'
import { defaultTerminalPrompt } from '../prompts/defaultTerminalPrompt'
import { defaultComputerUsePrompt } from '../prompts/defaultComputerUsePrompt'
import { defaultChartGenerationPrompt } from '../prompts/defaultChartGenerationPrompt'
import { defaultMemoryPrompt } from '../prompts/defaultMemoryPrompt'
import {
  DEFAULT_ASSISTANT_PERSONALITY,
  type AssistantPersonalityId,
} from '../prompts/assistantPersonalities'
import { defaultSkillsSettings, type SkillsSettings } from '../skills'
import type { AssistantMode } from '../chat/types'
import { getProviderEnabledDefaults, getProviderSecretFields } from '../providers'
import type { ProviderId } from '../providers/providerTypes'
import { warnOnceDuringHmr } from './hmrWarnings'
import type { OverlaySettings } from '../electron/types'

export type { OverlaySettings }

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
/** DeepSeek reasoning effort levels (documented fixed contract). */
export type DeepSeekReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'
const SECURE_SETTINGS_KEY_NAMES = [
  ...getProviderSecretFields(),
  'tavilyApiKey',
  'onlineCompilerApiKey',
] as const

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
  deepseekApiKey: string
  onlineCompilerApiKey: string

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
  deepseekModels: ConfiguredModel[]

  /**
   * Per-model DeepSeek reasoning ("thinking mode") preferences, keyed by model
   * `code`. The user's explicit toggle is the source of truth — we do not infer
   * thinking capability for DeepSeek. When an entry is missing or `enabled` is
   * false, reasoning is disabled for that model. `effort` maps to DeepSeek's
   * documented `reasoning_effort` enum.
   */
  deepseekReasoning?: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }>
  /**
   * The last reasoning effort the user picked anywhere, used as the default
   * effort when a model's reasoning is newly enabled.
   */
  deepseekLastEffort?: DeepSeekReasoningEffort

  // AI parameters
  temperature: number
  maxTokens: number
  systemPrompt: string
  assistantPersonality: AssistantPersonalityId
  /** Web search instructions appended when Web Search is enabled */
  webSearchPrompt: string
  /** Code execution instructions appended when Code Execution is enabled */
  codeExecutionPrompt: string
  /** Terminal instructions appended when the Terminal skill is enabled */
  terminalPrompt: string
  /** Computer use instructions appended when Computer Use is enabled */
  computerUsePrompt: string
  /** Chart generation instructions appended when Chart Generation is enabled */
  chartGenerationPrompt: string
  /** Memory autosave instructions appended when the Memory skill is enabled */
  memoryPrompt: string
  streamResponses: boolean

  // Tool settings
  assistantMode: AssistantMode
  toolsEnabled: boolean
  enabledTools: string[]
  skills: SkillsSettings
  /** When true, code execution runs without the approval dialog */
  codeExecutionAutoApprove: boolean
  /** When true, terminal (system_shell) commands run without the approval dialog */
  terminalAutoApprove: boolean
  /** When true, computer use actions run without the approval dialog */
  computerUseAutoApprove: boolean

  // Title generation
  titleModel: string
  titleGenerationPrompt: string
  titleGenerationDisplayMode: 'instant' | 'typewriter'

  // Background memory extraction ("dreaming"). Empty string = follow the active chat model.
  memoryModel: string

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
  /**
   * Discord Rich Presence preferences. Lives in the sanitized `zura-settings`
   * blob. The `appId` field should be set to a valid Discord Application ID
   * for the feature to work.
   */
  discordRpc?: {
    appId: string
  }
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
  deepseekApiKey: '',

  onlineCompilerApiKey: '',
  // Model settings
  aiModel: '',
  modelProvider: 'openrouter',
  providerEnabled: getProviderEnabledDefaults(),
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
  fireworksModels: [],
  deepseekModels: [
    { code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', enabled: true, maxContext: 1048576, supportsToolCall: true, modelType: 'chat' },
    { code: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', enabled: true, maxContext: 1048576, supportsToolCall: true, supportsDeepThinking: true, modelType: 'reasoning' },
  ],

  // AI parameters
  temperature: 0.7,
  maxTokens: 8000,
  systemPrompt: defaultSystemPrompt,
  assistantPersonality: DEFAULT_ASSISTANT_PERSONALITY,
  webSearchPrompt: defaultWebSearchPrompt,
  codeExecutionPrompt: defaultCodeExecutionPrompt,
  terminalPrompt: defaultTerminalPrompt,
  computerUsePrompt: defaultComputerUsePrompt,
  chartGenerationPrompt: defaultChartGenerationPrompt,
  memoryPrompt: defaultMemoryPrompt,
  streamResponses: true,

  // Tool settings
  assistantMode: 'chat',
  toolsEnabled: true,
  enabledTools: ['web_search'],
  skills: defaultSkillsSettings,

  codeExecutionAutoApprove: false,
  terminalAutoApprove: false,
  computerUseAutoApprove: false,
  // Title generation
  titleModel: '',
  titleGenerationPrompt: defaultTitleGenerationPrompt,
  titleGenerationDisplayMode: 'instant',

  // Background memory extraction — empty = follow the active chat model.
  memoryModel: '',

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
  discordRpc: {
    appId: '1512516130911162610',
  },
  deepseekReasoning: {},
  deepseekLastEffort: 'high',
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

  useEffect(() => {
    const loadSecureKeys = async () => {
      try {
        // Migrate existing keys from localStorage if needed
        await migrateApiKeysFromLocalStorage(settingsConfig as unknown as Record<string, string | undefined>)

        const secureKeys = await loadApiKeyPresenceFromSecureStorage()
        const hasSecureKeys = SECURE_SETTINGS_KEY_NAMES.some((key) => Boolean(secureKeys[key]))

        if (hasSecureKeys) {
          const secureKeyUpdates = Object.fromEntries(
            SECURE_SETTINGS_KEY_NAMES.map((key) => [key, secureKeys[key]])
          )
          setSettingsConfig((prev) => ({
            ...prev,
            ...secureKeyUpdates,
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
