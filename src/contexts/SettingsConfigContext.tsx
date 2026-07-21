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
  discoverStartupOllamaModels,
  loadSecureSettingPresence,
  syncReminderExtensionState,
} from './settingsBootstrap'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'
import { defaultWebSearchPrompt } from '../prompts/defaultWebSearchPrompt'
import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import { defaultCodeExecutionPrompt } from '../prompts/defaultCodeExecutionPrompt'
import { defaultTerminalPrompt } from '../prompts/defaultTerminalPrompt'
import { defaultComputerUsePrompt } from '../prompts/defaultComputerUsePrompt'
import { defaultChartGenerationPrompt } from '../prompts/defaultChartGenerationPrompt'
import { defaultMemoryPrompt } from '../prompts/defaultMemoryPrompt'
import { defaultRemindersPrompt } from '../prompts/defaultRemindersPrompt'
import { defaultArtifactsPrompt } from '../prompts/defaultArtifactsPrompt'
import {
  DEFAULT_ASSISTANT_PERSONALITY,
  type AssistantPersonalityId,
} from '../prompts/assistantPersonalities'
import {
  defaultSkillsSettings,
  isSkillEnabled,
  type ExtensionsSettings,
  type SkillsSettings,
} from '../skills'
import type { AssistantMode } from '../chat/types'
import { getProviderEnabledDefaults, getProviderSecretFields } from '../providers'
import type { ProviderId } from '../providers/providerTypes'
import type { AlibabaRegion } from '../services/alibabaEndpoints'
import { warnOnceDuringHmr } from './hmrWarnings'
import type { EmailNotificationSettings } from '../electron/types'
import type { AgentSkillsSettings } from '../agentSkills/types'

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
  openRouterReasoningDetected?: boolean
  /** Reasoning efforts advertised by the provider for this exact model. */
  supportedReasoningEfforts?: DeepSeekReasoningEffort[]
}

type ProviderKey = ProviderId
type ProviderEnabledMap = Partial<Record<ProviderKey, boolean>>
export type TavilySearchDepth = 'ultra-fast' | 'fast' | 'basic' | 'advanced'
export type TavilySearchDepthPreference = 'auto' | TavilySearchDepth
/** DeepSeek reasoning effort levels (documented fixed contract). */
export type DeepSeekReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'
const SECURE_SETTINGS_KEY_NAMES = [
  ...getProviderSecretFields(),
  'tavilyApiKey',
  'onlineCompilerApiKey',
  'brevoApiKey',
] as const

/**
 * Configuration-related settings that change infrequently
 */
export interface SettingsConfig {
  // API Keys
  openRouterApiKey: string
  openRouterDebug: boolean
  groqApiKey: string
  tavilyApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  alibabaApiKey: string
  alibabaRegion: AlibabaRegion
  fireworksApiKey: string
  nvidiaApiKey: string
  deepseekApiKey: string
  opencodeGoApiKey: string
  onlineCompilerApiKey: string
  brevoApiKey: string

  // Model settings
  aiModel: string
  modelProvider: ProviderId
  providerEnabled?: ProviderEnabledMap
  configuredModels: ConfiguredModel[]
  ollamaUrl: string
  ollamaModels: ConfiguredModel[]
  groqModels: ConfiguredModel[]
  alibabaModels: ConfiguredModel[]
  codexModels: ConfiguredModel[]
  fireworksModels: ConfiguredModel[]
  nvidiaModels: ConfiguredModel[]
  deepseekModels: ConfiguredModel[]
  opencodeModels: ConfiguredModel[]

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
  /**
   * Per-model OpenRouter reasoning effort preferences, keyed by configured
   * OpenRouter model `code`. Provider Hub only detects capability; the dashboard
   * model picker owns effort selection after detection.
   */
  openRouterReasoningEffort?: Record<string, DeepSeekReasoningEffort>
  /** Per-model ChatGPT Codex reasoning effort selected in the dashboard model picker. */
  codexReasoningEffort?: Record<string, DeepSeekReasoningEffort>
  /**
   * Per-model NVIDIA reasoning effort preferences, keyed by configured
   * NVIDIA model `code`. The dashboard model picker controls this; NVIDIA NIM
   * does not expose native reasoning effort levels, but the UI keeps the
   * control consistent with other reasoning-capable providers.
   */
  nvidiaReasoningEffort?: Record<string, DeepSeekReasoningEffort>

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
  /** Reminders & Lookouts instructions appended when the Reminders skill is enabled */
  remindersPrompt: string
  /** Artifacts instructions appended when the Artifacts extension is enabled */
  artifactsPrompt: string
  streamResponses: boolean

  // Tool settings
  assistantMode: AssistantMode
  toolsEnabled: boolean
  enabledTools: string[]
  extensionDefaultsVersion: number
  extensions: ExtensionsSettings
  skills: SkillsSettings
  agentSkills: AgentSkillsSettings

  // Title generation
  titleModel: string
  titleGenerationPrompt: string
  titleGenerationDisplayMode: 'instant' | 'typewriter'

  // Background memory extraction ("dreaming"). Empty string = follow the active chat model.
  memoryModel: string

  // Quick prompts
  quickPrompts: string[]

  // Todos
  todos: TodoItem[]

  // Remember settings
  rememberLastChatSession: boolean
  rememberLastSettingsSection: boolean
  rememberLastDashboardView: boolean
  emailNotifications: EmailNotificationSettings
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
  groqApiKey: '',
  tavilyApiKey: '',
  tavilySearchDepthPreference: 'auto',
  webSearchIncludeImages: true,
  alibabaApiKey: '',
  alibabaRegion: 'singapore',
  fireworksApiKey: '',
  nvidiaApiKey: '',
  deepseekApiKey: '',
  opencodeGoApiKey: '',

  onlineCompilerApiKey: '',
  brevoApiKey: '',
  // Model settings
  aiModel: '',
  modelProvider: 'openrouter',
  providerEnabled: getProviderEnabledDefaults(),
  configuredModels: [],
  ollamaUrl: 'http://localhost:11434',
  ollamaModels: [],
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
  codexModels: [
    {
      code: 'gpt-5.4',
      displayName: 'GPT-5.4',
      enabled: true,
      supportsDeepThinking: true,
      supportsToolCall: true,
      modelType: 'reasoning',
    },
  ],
  fireworksModels: [],
  nvidiaModels: [
    {
      code: 'minimaxai/minimax-m3',
      displayName: 'MiniMax M3',
      enabled: true,
      maxContext: 1048576,
      inputModalities: ['text', 'image', 'video'],
      outputModalities: ['text'],
      supportsToolCall: true,
      supportsVision: true,
      supportsDeepThinking: true,
      supportsVideoRecognition: true,
      modelType: 'reasoning',
    },
  ],
  deepseekModels: [
    {
      code: 'deepseek-v4-flash',
      displayName: 'DeepSeek V4 Flash',
      enabled: true,
      maxContext: 1048576,
      supportsToolCall: true,
      modelType: 'chat',
    },
    {
      code: 'deepseek-v4-pro',
      displayName: 'DeepSeek V4 Pro',
      enabled: true,
      maxContext: 1048576,
      supportsToolCall: true,
      supportsDeepThinking: true,
      modelType: 'reasoning',
    },
  ],
  opencodeModels: [
    {
      code: 'deepseek-v4-pro',
      displayName: 'DeepSeek V4 Pro',
      enabled: true,
      maxContext: 1048576,
      supportsToolCall: true,
      modelType: 'chat',
    },
    {
      code: 'kimi-k2.7-code',
      displayName: 'Kimi K2.7 Code',
      enabled: true,
      maxContext: 262144,
      supportsToolCall: true,
      modelType: 'chat',
    },
    {
      code: 'glm-5.2',
      displayName: 'GLM 5.2',
      enabled: true,
      maxContext: 131072,
      supportsToolCall: true,
      modelType: 'chat',
    },
    {
      code: 'qwen3.7-plus',
      displayName: 'Qwen3.7 Plus',
      enabled: true,
      maxContext: 262144,
      supportsToolCall: true,
      modelType: 'chat',
    },
    {
      code: 'minimax-m3',
      displayName: 'MiniMax M3',
      enabled: true,
      maxContext: 1048576,
      supportsToolCall: true,
      modelType: 'chat',
    },
    {
      code: 'deepseek-v4-flash',
      displayName: 'DeepSeek V4 Flash',
      enabled: true,
      maxContext: 1048576,
      supportsToolCall: true,
      modelType: 'chat',
    },
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
  remindersPrompt: defaultRemindersPrompt,
  artifactsPrompt: defaultArtifactsPrompt,
  streamResponses: true,

  // Tool settings
  assistantMode: 'chat',
  toolsEnabled: true,
  enabledTools: ['web_search'],
  extensionDefaultsVersion: 2,
  extensions: defaultSkillsSettings,
  skills: defaultSkillsSettings,
  agentSkills: {
    enabled: false,
    projectRoot: '',
    disabledSkillNames: [],
    catalog: [],
  },

  // Title generation
  titleModel: '',
  titleGenerationPrompt: defaultTitleGenerationPrompt,
  titleGenerationDisplayMode: 'instant',

  // Background memory extraction — empty = follow the active chat model.
  memoryModel: '',

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
  emailNotifications: {
    enabled: false,
    senderName: 'ZuraAI',
    senderEmail: '',
    recipientEmail: '',
  },
  discordRpc: {
    appId: '1512516130911162610',
  },
  deepseekReasoning: {},
  deepseekLastEffort: 'high',
  openRouterReasoningEffort: {},
  codexReasoningEffort: {},
  nvidiaReasoningEffort: {},
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
        const secureKeys = await loadSecureSettingPresence(
          settingsConfig as unknown as Record<string, string | undefined>,
          SECURE_SETTINGS_KEY_NAMES
        )
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
        const models = await discoverStartupOllamaModels(settingsConfig.ollamaUrl)
        if (models.length > 0) {
          setSettingsConfig((prev) => ({ ...prev, ollamaModels: models }))
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

  useEffect(() => {
    void syncReminderExtensionState(
      isSkillEnabled(settingsConfig.extensions ?? settingsConfig.skills, 'reminders')
    ).catch((error) => {
      console.error('[SettingsConfigContext] Failed to sync Reminders extension state:', error)
    })
  }, [settingsConfig.extensions, settingsConfig.skills])

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
