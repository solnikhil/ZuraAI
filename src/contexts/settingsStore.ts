import {
  defaultSettingsUI,
  type SettingsUI,
} from './SettingsUIContext'
import {
  defaultSettingsConfig,
  type SettingsConfig,
} from './SettingsConfigContext'
import { getAllToolDefinitions } from '../tools/definitions'
import { migrateSkillsFromLegacySettings } from '../skills'
import {
  getProviderDefinitions,
  getProviderEnabledDefaults,
  getProviderModelListFields,
  getProviderSecretFields,
  type ProviderModelListKey,
} from '../providers'

export interface Settings extends SettingsUI, SettingsConfig {}

export const defaultSettings: Settings = {
  ...defaultSettingsUI,
  ...defaultSettingsConfig,
}

export const UI_SETTING_KEYS: (keyof SettingsUI)[] = [
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
  
  'chatBubbleStyle',
  'chatSelectedOverlayStyle',
  'placeholderStyle',
  'modelSelector',
  'promptAutoHide',
]

const SECRET_SETTING_KEYS: Array<keyof Settings> = [
  ...getProviderSecretFields(),
  'tavilyApiKey',
  'onlineCompilerApiKey',
]

const PROVIDER_IDS = getProviderDefinitions().map((provider) => provider.id)
const PROVIDER_ENABLED_DEFAULTS = getProviderEnabledDefaults()
const PROVIDER_MODEL_LIST_FIELDS = getProviderModelListFields()
const LEGACY_FIREWORKS_MODEL_ID_MAP: Record<string, string> = {
  'accounts/fireworks/models/kimi-k2p5-turbo': 'accounts/fireworks/routers/kimi-k2p5-turbo',
  'accounts/fireworks/models/kimi-k2p5-turbo-instruct': 'accounts/fireworks/routers/kimi-k2p5-turbo',
}
const LEGACY_FIREWORKS_SEEDED_MODEL_CODES = new Set([
  'accounts/fireworks/models/deepseek-v3p2',
  'accounts/fireworks/models/kimi-k2p5',
  'accounts/fireworks/routers/kimi-k2p5-turbo',
  'accounts/fireworks/models/deepseek-r1',
  'accounts/fireworks/models/llama-v3p1-405b-instruct',
  'accounts/fireworks/models/llama-v3p1-8b-instruct',
  'accounts/fireworks/models/llama-v3p1-70b-instruct',
  'accounts/fireworks/models/glm-5',
  'accounts/fireworks/models/qwen3-235b-a22b',
  'accounts/fireworks/models/glm-4p7',
  'accounts/fireworks/models/nvidia-nemotron-3-super-120b-a12b-fp8',
])
const LEGACY_WEB_SEARCH_STRATEGY_BLOCK =
  `SEARCH STRATEGY:
- For research or discovery tasks, begin with ONE broad exploratory search
- Do not pre-plan several searches from memory before seeing results`
const UPDATED_WEB_SEARCH_STRATEGY_BLOCK =
  `SEARCH STRATEGY:
- For research or discovery tasks with no obvious independent slices, begin with ONE broad exploratory search
- If the user asks for an explicit range or independent slices (for example: past 5 years, 2021-2025, regions, providers, products, competitors, or categories), do NOT start with one broad search. Instead, issue one focused web_search call per slice in the same assistant turn so the app can execute the batch in parallel
- Do not pre-plan several searches from memory before seeing results unless the user already gave a clear range or clear independent facets`
const WEB_SEARCH_LIMITATION_NOTE =
  '- Briefly note when the answer depends on web search results and that web results can be incomplete, outdated, or occasionally incorrect'
const WEB_SEARCH_PRIMARY_SOURCE_NOTE =
  '- When double-checking or verifying facts, prioritize official or primary sources over third-party summaries. Use third-party sources only when official sources are unavailable, incomplete, or useful for context, and label that limitation clearly'
const WEB_SEARCH_SOURCES_REQUIREMENT =
  '- In Sources:, list the relevant URLs as markdown links in the format [Title](URL)'
const LEGACY_TITLE_GENERATION_PROMPT_PREFIX =
  'Give this conversation a short descriptive title (2-6 words).'

function migrateWebSearchPrompt(prompt: unknown): unknown {
  if (typeof prompt !== 'string') return prompt

  let migratedPrompt = prompt
  if (migratedPrompt.includes(LEGACY_WEB_SEARCH_STRATEGY_BLOCK)) {
    migratedPrompt = migratedPrompt.replace(LEGACY_WEB_SEARCH_STRATEGY_BLOCK, UPDATED_WEB_SEARCH_STRATEGY_BLOCK)
  }

  if (
    !migratedPrompt.includes(WEB_SEARCH_LIMITATION_NOTE) &&
    migratedPrompt.includes(WEB_SEARCH_SOURCES_REQUIREMENT)
  ) {
    migratedPrompt = migratedPrompt.replace(
      WEB_SEARCH_SOURCES_REQUIREMENT,
      `${WEB_SEARCH_SOURCES_REQUIREMENT}\n${WEB_SEARCH_LIMITATION_NOTE}`
    )
  }

  if (
    !migratedPrompt.includes(WEB_SEARCH_PRIMARY_SOURCE_NOTE) &&
    migratedPrompt.includes(WEB_SEARCH_LIMITATION_NOTE)
  ) {
    migratedPrompt = migratedPrompt.replace(
      WEB_SEARCH_LIMITATION_NOTE,
      `${WEB_SEARCH_LIMITATION_NOTE}\n${WEB_SEARCH_PRIMARY_SOURCE_NOTE}`
    )
  }

  return migratedPrompt
}

function shouldClearLegacyFireworksSeededModels(models: unknown): boolean {
  if (!Array.isArray(models) || models.length !== LEGACY_FIREWORKS_SEEDED_MODEL_CODES.size) {
    return false
  }

  const seenCodes = new Set<string>()
  for (const model of models) {
    if (typeof model !== 'object' || model === null) {
      return false
    }

    const { code } = model as { code?: unknown }
    if (
      typeof code !== 'string' ||
      !LEGACY_FIREWORKS_SEEDED_MODEL_CODES.has(code) ||
      seenCodes.has(code)
    ) {
      return false
    }

    seenCodes.add(code)
  }

  return seenCodes.size === LEGACY_FIREWORKS_SEEDED_MODEL_CODES.size
}

function mergeProviderModelsWithDefaults<T extends { code: string; enabled?: boolean }>(
  storedModels: unknown,
  defaultModels: T[]
): T[] {
  if (storedModels === undefined || storedModels === null) {
    return defaultModels
  }

  if (!Array.isArray(storedModels)) {
    return defaultModels
  }

  if (storedModels.length === 0) {
    return []
  }

  const mergedDefaults = defaultModels.map((defaultModel) => {
    const existing = storedModels.find((model: { code: string }) => model.code === defaultModel.code)
    return existing ? { ...defaultModel, enabled: existing.enabled ?? defaultModel.enabled } : defaultModel
  })
  const defaultCodes = new Set(defaultModels.map((model) => model.code))
  const customModels = storedModels.filter((model: { code: string }) => !defaultCodes.has(model.code))

  return [...mergedDefaults, ...customModels]
}

function normalizeProviderModels<T extends { code: string; enabled?: boolean }>(
  storedModels: unknown,
  defaultModels: T[]
): T[] {
  return mergeProviderModelsWithDefaults(storedModels, defaultModels)
}

function getDefaultProviderModels(
  settings: Settings,
  modelListField: ProviderModelListKey
): Settings[ProviderModelListKey] {
  return settings[modelListField]
}

export function stripSecretSettings<T extends Record<string, unknown>>(raw: T): T {
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

export function parseStoredSettings(raw: string | null): Partial<Settings> {
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

export function normalizeStoredSettings(raw: string | null): Settings {
  const parsedFromStorage = parseStoredSettings(raw)
  const parsed = { ...defaultSettings, ...parsedFromStorage }
  const hasStoredOverlay = Object.prototype.hasOwnProperty.call(parsedFromStorage, 'overlay')

  delete (parsed as Record<string, unknown>).autoHideOverlay
  delete (parsed as Record<string, unknown>).overlayTransparency
  delete (parsed as Record<string, unknown>).loadOverlayOnStartup
  delete (parsed as Record<string, unknown>).shortcuts

  if (parsed.aiModel === 'openrouter/sherlock-dash-alpha') {
    parsed.aiModel = 'x-ai/grok-4.1-fast'
  }

  if (parsed.systemPrompt?.includes('Keep responses concise and actionable')) {
    parsed.systemPrompt = defaultSettings.systemPrompt
  }

  if (
    typeof parsed.systemPrompt === 'string' &&
    parsed.systemPrompt.includes("Today's year is 2026.") &&
    parsed.systemPrompt.includes('research-oriented AI assistant with a friendly, slightly nerdy persona')
  ) {
    parsed.systemPrompt = defaultSettings.systemPrompt
  }

  const defaultLen = defaultSettings.systemPrompt.length
  if (
    typeof parsed.systemPrompt === 'string' &&
    (parsed.systemPrompt.includes('You are Zura') ||
      (parsed.systemPrompt.startsWith('Role & Identity') &&
        parsed.systemPrompt.length < defaultLen - 10))
  ) {
    parsed.systemPrompt = defaultSettings.systemPrompt
  }

  if (parsed.webSearchPrompt === undefined) {
    parsed.webSearchPrompt = defaultSettings.webSearchPrompt
  } else {
    parsed.webSearchPrompt = migrateWebSearchPrompt(parsed.webSearchPrompt) as Settings['webSearchPrompt']
  }

  if (parsed.codeExecutionPrompt === undefined) {
    parsed.codeExecutionPrompt = defaultSettings.codeExecutionPrompt
  }

  if (parsed.computerUsePrompt === undefined) {
    parsed.computerUsePrompt = defaultSettings.computerUsePrompt
  }

  if (parsed.chartGenerationPrompt === undefined) {
    parsed.chartGenerationPrompt = defaultSettings.chartGenerationPrompt
  }

  if (!parsed.modelProvider) parsed.modelProvider = defaultSettings.modelProvider
  if (!PROVIDER_IDS.includes(parsed.modelProvider as typeof PROVIDER_IDS[number])) {
    parsed.modelProvider = 'openrouter'
  }

  parsed.providerEnabled = {
    ...PROVIDER_ENABLED_DEFAULTS,
    ...(typeof parsed.providerEnabled === 'object' && parsed.providerEnabled !== null
      ? parsed.providerEnabled
      : {}),
  }

  if (!parsed.ollamaUrl) parsed.ollamaUrl = defaultSettings.ollamaUrl
  if (typeof parsed.openRouterDebug !== 'boolean') {
    parsed.openRouterDebug = defaultSettings.openRouterDebug
  }
  for (const secretKey of SECRET_SETTING_KEYS) {
    if (!parsed[secretKey]) {
      parsed[secretKey] = defaultSettings[secretKey] as never
    }
  }

  for (const modelListField of PROVIDER_MODEL_LIST_FIELDS) {
    if (modelListField === 'fireworksModels') {
      continue
    }

    parsed[modelListField] = normalizeProviderModels(
      parsed[modelListField],
      getDefaultProviderModels(defaultSettings, modelListField)
    ) as never
  }

  if (parsed.aiModel && LEGACY_FIREWORKS_MODEL_ID_MAP[parsed.aiModel]) {
    parsed.aiModel = LEGACY_FIREWORKS_MODEL_ID_MAP[parsed.aiModel]
  }
  const userFireworks = Array.isArray(parsed.fireworksModels)
    ? parsed.fireworksModels.map((model) => migrateConfiguredModelCode(model))
    : parsed.fireworksModels
  const normalizedFireworksModels = normalizeProviderModels(
    userFireworks,
    defaultSettings.fireworksModels
  )
  parsed.fireworksModels = shouldClearLegacyFireworksSeededModels(normalizedFireworksModels)
    ? []
    : normalizedFireworksModels

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

  if ('titleModelProvider' in parsed) {
    delete parsed.titleModelProvider
  }
  if (parsed.titleModel === undefined || parsed.titleModel === null) {
    parsed.titleModel = defaultSettings.titleModel
  }
  if (parsed.titleModel?.startsWith('gemini-')) {
    parsed.titleModel = ''
  }
  if (parsed.titleModel === 'google/gemini-2.0-flash-exp:free') {
    parsed.titleModel = ''
  }
  if (typeof parsed.titleGenerationPrompt !== 'string') {
    parsed.titleGenerationPrompt = defaultSettings.titleGenerationPrompt
  } else if (parsed.titleGenerationPrompt.startsWith(LEGACY_TITLE_GENERATION_PROMPT_PREFIX)) {
    parsed.titleGenerationPrompt = defaultSettings.titleGenerationPrompt
  }
  if (
    !parsed.titleGenerationDisplayMode ||
    !['instant', 'typewriter'].includes(parsed.titleGenerationDisplayMode)
  ) {
    parsed.titleGenerationDisplayMode = defaultSettings.titleGenerationDisplayMode
  }

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

  // Streaming is the only supported chat mode in the current UI.
  // Older installs may still have `streamResponses: false` persisted from a legacy default.
  if (typeof parsed.streamResponses !== 'boolean' || parsed.streamResponses === false) {
    parsed.streamResponses = true
  }

  if (!parsed.todos) parsed.todos = []
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

  if (typeof parsed.codeExecutionAutoApprove !== 'boolean') {
    parsed.codeExecutionAutoApprove = defaultSettings.codeExecutionAutoApprove
  }

  if (typeof parsed.computerUseAutoApprove !== 'boolean') {
    parsed.computerUseAutoApprove = defaultSettings.computerUseAutoApprove
  }

  if (!parsed.favoriteModels) parsed.favoriteModels = defaultSettings.favoriteModels

  parsed.titleBarDensity = 'compact'
  if (parsed.titleBarShowAppName === undefined) {
    parsed.titleBarShowAppName = defaultSettings.titleBarShowAppName
  }
  if (parsed.titleBarShowChatTitle === undefined) {
    parsed.titleBarShowChatTitle = defaultSettings.titleBarShowChatTitle
  }
  if (parsed.titleBarShowModel === undefined) {
    parsed.titleBarShowModel = defaultSettings.titleBarShowModel
  }
  if (parsed.rememberLastChatSession === undefined) {
    parsed.rememberLastChatSession = defaultSettings.rememberLastChatSession
  }
  if (parsed.rememberLastSettingsSection === undefined) {
    parsed.rememberLastSettingsSection = defaultSettings.rememberLastSettingsSection
  }
  if (parsed.rememberLastDashboardView === undefined) {
    parsed.rememberLastDashboardView = defaultSettings.rememberLastDashboardView
  }
  // Migrate legacy buddyOverlay key to overlay.
  const legacyRecord = parsed as Record<string, unknown>
  if (
    legacyRecord.buddyOverlay &&
    typeof legacyRecord.buddyOverlay === 'object' &&
    !hasStoredOverlay
  ) {
    parsed.overlay = {
      ...defaultSettings.overlay,
      ...(legacyRecord.buddyOverlay as Partial<typeof defaultSettings.overlay>),
      anchor: 'right',
    }
  }
  delete legacyRecord.buddyOverlay

  if (!parsed.overlay || typeof parsed.overlay !== 'object') {
    parsed.overlay = defaultSettings.overlay
  } else {
    parsed.overlay = {
      ...defaultSettings.overlay,
      ...parsed.overlay,
      anchor: 'right',
    }
  }

  if (!parsed.commandBar) {
    parsed.commandBar = defaultSettings.commandBar
  } else {
    parsed.commandBar = { ...defaultSettings.commandBar, ...parsed.commandBar }
  }

  parsed.configuredModels = normalizeProviderModels(
    parsed.configuredModels,
    defaultSettings.configuredModels
  )
  if (!parsed.activeTheme) parsed.activeTheme = defaultSettings.activeTheme
  delete (parsed as Record<string, unknown>).frostedSidebar
  delete (parsed as Record<string, unknown>).frostedPrompt
  delete (parsed as Record<string, unknown>).sidebarAutoHideOnResize
  if (!parsed.promptAutoHide) {
    parsed.promptAutoHide = defaultSettings.promptAutoHide
  } else {
    parsed.promptAutoHide = { ...defaultSettings.promptAutoHide, ...parsed.promptAutoHide }
  }

  if (parsed.themeContrast === undefined) {
    parsed.themeContrast = (parsed as Record<string, unknown>).softenedContrast === true ? 85 : 100
  }
  delete (parsed as Record<string, unknown>).softenedContrast
  delete (parsed as Record<string, unknown>).notificationsEnabled
  delete (parsed as Record<string, unknown>).nativeNotificationsEnabled
  delete (parsed as Record<string, unknown>).toastDuration
  delete (parsed as Record<string, unknown>).doNotDisturb

  if (!parsed.chatBubbleStyle) parsed.chatBubbleStyle = defaultSettings.chatBubbleStyle
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

  delete (parsed as Record<string, unknown>).responseTransitionMode

  return parsed
}

export function getInitialUISettings(settings: Settings): Partial<SettingsUI> {
  return {
    theme: settings.theme,
    activeTheme: settings.activeTheme,
    themeAccent: settings.themeAccent,
    themeBackground: settings.themeBackground,
    themeForeground: settings.themeForeground,
    themeContrast: settings.themeContrast,
    titleBarDensity: settings.titleBarDensity,
    titleBarShowAppName: settings.titleBarShowAppName,
    titleBarShowChatTitle: settings.titleBarShowChatTitle,
    titleBarShowModel: settings.titleBarShowModel,
    commandBar: settings.commandBar,
    promptAutoHide: settings.promptAutoHide,
    chatBubbleStyle: settings.chatBubbleStyle,
    chatSelectedOverlayStyle: settings.chatSelectedOverlayStyle,
    modelSelector: settings.modelSelector,
  }
}

export function getInitialConfigSettings(settings: Settings): Partial<SettingsConfig> {
  return {
    openRouterApiKey: settings.openRouterApiKey,
    openRouterDebug: settings.openRouterDebug,
    perplexityApiKey: settings.perplexityApiKey,
    groqApiKey: settings.groqApiKey,
    tavilyApiKey: settings.tavilyApiKey,
    tavilySearchDepthPreference: settings.tavilySearchDepthPreference,
    webSearchIncludeImages: settings.webSearchIncludeImages,
    alibabaApiKey: settings.alibabaApiKey,
    fireworksApiKey: settings.fireworksApiKey,
    deepseekApiKey: settings.deepseekApiKey,
    aiModel: settings.aiModel,
    onlineCompilerApiKey: settings.onlineCompilerApiKey,
    modelProvider: settings.modelProvider,
    providerEnabled: settings.providerEnabled,
    configuredModels: settings.configuredModels,
    ollamaUrl: settings.ollamaUrl,
    ollamaModels: settings.ollamaModels,
    perplexityModels: settings.perplexityModels,
    groqModels: settings.groqModels,
    alibabaModels: settings.alibabaModels,
    fireworksModels: settings.fireworksModels,
    deepseekModels: settings.deepseekModels,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    systemPrompt: settings.systemPrompt,
    webSearchPrompt: settings.webSearchPrompt,
    codeExecutionPrompt: settings.codeExecutionPrompt,
    computerUsePrompt: settings.computerUsePrompt,
    chartGenerationPrompt: settings.chartGenerationPrompt,
    streamResponses: settings.streamResponses,
    toolsEnabled: settings.toolsEnabled,
    enabledTools: settings.enabledTools,
    skills: settings.skills,
    titleModel: settings.titleModel,
    codeExecutionAutoApprove: settings.codeExecutionAutoApprove,
    computerUseAutoApprove: settings.computerUseAutoApprove,
    titleGenerationPrompt: settings.titleGenerationPrompt,
    titleGenerationDisplayMode: settings.titleGenerationDisplayMode,
    favoriteModels: settings.favoriteModels,
    quickPrompts: settings.quickPrompts,
    todos: settings.todos,
    rememberLastChatSession: settings.rememberLastChatSession,
    rememberLastSettingsSection: settings.rememberLastSettingsSection,
    rememberLastDashboardView: settings.rememberLastDashboardView,
    overlay: settings.overlay,
  }
}
