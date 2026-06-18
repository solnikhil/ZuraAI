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
import { normalizeAssistantPersonalityId } from '../prompts/assistantPersonalities'
import { normalizeDeepseekReasoning, coerceReasoningEffort } from '../utils/deepseekReasoning'

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
  'remindersAppearance',
  'modelSelector',
  'promptAutoHide',
]

const SECRET_SETTING_KEYS: Array<keyof Settings> = [
  ...getProviderSecretFields(),
  'tavilyApiKey',
  'onlineCompilerApiKey',
  'brevoApiKey',
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

  // Migrate users on the pre-ZuraAI-identity default to the new default
  if (
    typeof parsed.systemPrompt === 'string' &&
    parsed.systemPrompt.includes("Today's year is") &&
    parsed.systemPrompt.includes(
      'You are a research-oriented AI assistant optimized for accurate reasoning, tool use, and task completion.'
    ) &&
    !parsed.systemPrompt.includes('ZuraAI')
  ) {
    parsed.systemPrompt = defaultSettings.systemPrompt
  }

  parsed.systemPrompt = defaultSettings.systemPrompt
  parsed.assistantPersonality = normalizeAssistantPersonalityId(parsed.assistantPersonality)
  parsed.webSearchPrompt = defaultSettings.webSearchPrompt
  parsed.codeExecutionPrompt = defaultSettings.codeExecutionPrompt
  parsed.terminalPrompt = defaultSettings.terminalPrompt
  parsed.computerUsePrompt = defaultSettings.computerUsePrompt
  parsed.chartGenerationPrompt = defaultSettings.chartGenerationPrompt
  parsed.memoryPrompt = defaultSettings.memoryPrompt
  parsed.remindersPrompt = defaultSettings.remindersPrompt

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
  if (typeof parsed.memoryModel !== 'string') {
    parsed.memoryModel = defaultSettings.memoryModel
  }
  parsed.titleGenerationPrompt = defaultSettings.titleGenerationPrompt
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
  if ((parsed as Record<string, unknown>).assistantMode === 'research') {
    parsed.assistantMode = 'chat'
  }
  if (
    parsed.assistantMode !== 'chat' &&
    parsed.assistantMode !== 'agent'
  ) {
    parsed.assistantMode = defaultSettings.assistantMode
  }
  if (parsed.toolsEnabled === undefined) parsed.toolsEnabled = defaultSettings.toolsEnabled
  if (!parsed.tavilyApiKey) parsed.tavilyApiKey = defaultSettings.tavilyApiKey
  if (!parsed.brevoApiKey) parsed.brevoApiKey = defaultSettings.brevoApiKey
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
    memoryEnabled: legacySettingsRecord.memoryEnabled,
    autoMemoryEnabled: legacySettingsRecord.autoMemoryEnabled,
  })
  delete legacySettingsRecord.deepResearchEnabled
  delete legacySettingsRecord.webSearchEnabled
  delete legacySettingsRecord.structuredResearchEnabled
  delete legacySettingsRecord.memoryEnabled
  delete legacySettingsRecord.autoMemoryEnabled

  if (typeof parsed.codeExecutionAutoApprove !== 'boolean') {
    parsed.codeExecutionAutoApprove = defaultSettings.codeExecutionAutoApprove
  }

  if (typeof parsed.terminalAutoApprove !== 'boolean') {
    parsed.terminalAutoApprove = defaultSettings.terminalAutoApprove
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

  if (!parsed.emailNotifications || typeof parsed.emailNotifications !== 'object') {
    parsed.emailNotifications = defaultSettings.emailNotifications
  } else {
    const emailNotifications = parsed.emailNotifications as unknown as Record<string, unknown>
    parsed.emailNotifications = {
      ...defaultSettings.emailNotifications,
      enabled: emailNotifications.enabled === true,
      senderName: typeof emailNotifications.senderName === 'string'
        ? emailNotifications.senderName
        : defaultSettings.emailNotifications.senderName,
      senderEmail: typeof emailNotifications.senderEmail === 'string'
        ? emailNotifications.senderEmail
        : '',
      recipientEmail: typeof emailNotifications.recipientEmail === 'string'
        ? emailNotifications.recipientEmail
        : '',
    }
  }

  if (!parsed.discordRpc || typeof parsed.discordRpc !== 'object') {
    parsed.discordRpc = defaultSettings.discordRpc
  } else {
    // Legacy `enabled` field removed — Discord RPC is now always-on when appId is present.
    delete (parsed.discordRpc as Record<string, unknown>).enabled
    parsed.discordRpc = {
      ...defaultSettings.discordRpc,
      ...parsed.discordRpc,
    }
  }

  if (!parsed.commandBar) {
    parsed.commandBar = defaultSettings.commandBar
  } else {
    parsed.commandBar = { ...defaultSettings.commandBar, ...parsed.commandBar }
  }

  if (!parsed.remindersAppearance || typeof parsed.remindersAppearance !== 'object') {
    parsed.remindersAppearance = defaultSettings.remindersAppearance
  } else {
    const remindersAppearance = parsed.remindersAppearance as unknown as Record<string, unknown>
    parsed.remindersAppearance = {
      ...defaultSettings.remindersAppearance!,
      containerStyle: ['panel', 'flush', 'framed'].includes(String(remindersAppearance.containerStyle))
        ? remindersAppearance.containerStyle as NonNullable<SettingsUI['remindersAppearance']>['containerStyle']
        : defaultSettings.remindersAppearance!.containerStyle,
      cardStyle: ['solid', 'subtle', 'outline'].includes(String(remindersAppearance.cardStyle))
        ? remindersAppearance.cardStyle as NonNullable<SettingsUI['remindersAppearance']>['cardStyle']
        : defaultSettings.remindersAppearance!.cardStyle,
      actionStyle: ['pill', 'soft', 'minimal'].includes(String(remindersAppearance.actionStyle))
        ? remindersAppearance.actionStyle as NonNullable<SettingsUI['remindersAppearance']>['actionStyle']
        : defaultSettings.remindersAppearance!.actionStyle,
      badgeStyle: ['soft', 'filled', 'outline'].includes(String(remindersAppearance.badgeStyle))
        ? remindersAppearance.badgeStyle as NonNullable<SettingsUI['remindersAppearance']>['badgeStyle']
        : defaultSettings.remindersAppearance!.badgeStyle,
      useAccentTint:
        typeof remindersAppearance.useAccentTint === 'boolean'
          ? remindersAppearance.useAccentTint
          : defaultSettings.remindersAppearance!.useAccentTint,
    }
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

  parsed.deepseekReasoning = normalizeDeepseekReasoning(parsed.deepseekReasoning)
  parsed.deepseekLastEffort =
    coerceReasoningEffort(parsed.deepseekLastEffort) ?? defaultSettings.deepseekLastEffort

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
    placeholderStyle: settings.placeholderStyle,
    remindersAppearance: settings.remindersAppearance,
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
    nvidiaApiKey: settings.nvidiaApiKey,
    deepseekApiKey: settings.deepseekApiKey,
    aiModel: settings.aiModel,
    onlineCompilerApiKey: settings.onlineCompilerApiKey,
    brevoApiKey: settings.brevoApiKey,
    modelProvider: settings.modelProvider,
    providerEnabled: settings.providerEnabled,
    configuredModels: settings.configuredModels,
    ollamaUrl: settings.ollamaUrl,
    ollamaModels: settings.ollamaModels,
    perplexityModels: settings.perplexityModels,
    groqModels: settings.groqModels,
    alibabaModels: settings.alibabaModels,
    fireworksModels: settings.fireworksModels,
    nvidiaModels: settings.nvidiaModels,
    deepseekModels: settings.deepseekModels,
    deepseekReasoning: settings.deepseekReasoning,
    deepseekLastEffort: settings.deepseekLastEffort,
    openRouterReasoningEffort: settings.openRouterReasoningEffort,
    nvidiaReasoningEffort: settings.nvidiaReasoningEffort,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    systemPrompt: settings.systemPrompt,
    assistantPersonality: settings.assistantPersonality,
    webSearchPrompt: settings.webSearchPrompt,
    codeExecutionPrompt: settings.codeExecutionPrompt,
    terminalPrompt: settings.terminalPrompt,
    computerUsePrompt: settings.computerUsePrompt,
    chartGenerationPrompt: settings.chartGenerationPrompt,
    memoryPrompt: settings.memoryPrompt,
    remindersPrompt: settings.remindersPrompt,
    streamResponses: settings.streamResponses,
    assistantMode: settings.assistantMode,
    toolsEnabled: settings.toolsEnabled,
    enabledTools: settings.enabledTools,
    skills: settings.skills,
    titleModel: settings.titleModel,
    codeExecutionAutoApprove: settings.codeExecutionAutoApprove,
    terminalAutoApprove: settings.terminalAutoApprove,
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
    emailNotifications: settings.emailNotifications,
    discordRpc: settings.discordRpc,
  }
}
