import { generateAlibabaCompletion } from './alibaba'
import { generateFireworksCompletion } from './fireworks'
import { generateGroqCompletion } from './groq'
import { generateOllamaCompletion } from './ollama'
import { generateOpenRouterCompletion } from './openrouter'
import { generatePerplexityCompletion } from './perplexity'
import { getOpenRouterApiKey } from '../utils/openRouterKey'
import { getTitleEligibleModels } from '../utils/titleGenerationModels'
import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import type { ConfiguredModel, SettingsConfig } from '../contexts/SettingsConfigContext'
import {
  getActiveProviderDefinitions,
  hasProviderAccess,
  getProviderModels as getProviderModelsFromRegistry,
  normalizeProviderId,
  type ActiveProviderId,
} from '../providers'

type TitleProvider = ActiveProviderId
type TitleGenerationAttempt = {
  provider: TitleProvider
  model: string
}

type TitleGenerationSettings = Partial<
  Pick<
    SettingsConfig,
    | 'titleModelProvider'
    | 'modelProvider'
    | 'titleModel'
    | 'aiModel'
    | 'titleGenerationPrompt'
    | 'alibabaApiKey'
    | 'fireworksApiKey'
    | 'groqApiKey'
    | 'ollamaUrl'
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'configuredModels'
    | 'ollamaModels'
    | 'perplexityModels'
    | 'groqModels'
    | 'alibabaModels'
    | 'fireworksModels'
  >
>

const TITLE_PROVIDERS: TitleProvider[] = getActiveProviderDefinitions().map(
  (provider) => provider.id as TitleProvider
)

const isTitleProvider = (value: unknown): value is TitleProvider =>
  typeof value === 'string' && TITLE_PROVIDERS.includes(value as TitleProvider)

const enforceThreeWords = (title: string): string => {
  const words = title.trim().split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return 'New Chat Session'
  if (words.length === 3) return words.join(' ')
  if (words.length > 3) return words.slice(0, 3).join(' ')
  return words.join(' ')
}

const sanitizeTitle = (title: string): string => {
  return title.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/g, '')
}

const resolveTitleProvider = (settings: TitleGenerationSettings): TitleProvider => {
  const requestedTitleProvider = normalizeProviderId(settings.titleModelProvider)
  if (isTitleProvider(requestedTitleProvider)) {
    return requestedTitleProvider
  }
  const requestedModelProvider = normalizeProviderId(settings.modelProvider)
  if (isTitleProvider(requestedModelProvider)) {
    return requestedModelProvider
  }
  return 'openrouter'
}

const getProviderModels = (
  settings: TitleGenerationSettings,
  provider: TitleProvider,
): ConfiguredModel[] => {
  return getTitleEligibleModels(
    getProviderModelsFromRegistry(settings, provider).filter((model): model is ConfiguredModel => {
      return Boolean(model && typeof model.code === 'string' && model.code.length > 0)
    })
  )
}

const getFirstAvailableModel = (
  settings: TitleGenerationSettings,
  provider: TitleProvider,
): string | null => {
  const providerModels = getProviderModels(settings, provider)
  const enabledModels = providerModels.filter((model) => model.enabled !== false)
  const candidateModels = enabledModels.length > 0 ? enabledModels : providerModels
  return candidateModels[0]?.code || null
}

const buildTitleAttempt = (
  settings: TitleGenerationSettings,
  provider: TitleProvider,
  preferredModel?: string,
): TitleGenerationAttempt | null => {
  if (!hasProviderAccess(settings, provider)) {
    return null
  }

  const providerModels = getProviderModels(settings, provider)
  const enabledProviderModels = providerModels.filter((model) => model.enabled !== false)
  const candidateModels = enabledProviderModels.length > 0 ? enabledProviderModels : providerModels

  const normalizedPreferredModel = typeof preferredModel === 'string' ? preferredModel.trim() : ''
  if (
    normalizedPreferredModel &&
    candidateModels.some((model) => model.code === normalizedPreferredModel)
  ) {
    return { provider, model: normalizedPreferredModel }
  }

  if (candidateModels.length > 0) {
    return { provider, model: candidateModels[0].code }
  }

  const firstAvailable = getFirstAvailableModel(settings, provider)
  if (firstAvailable) {
    return { provider, model: firstAvailable }
  }

  return null
}

const buildTitleGenerationAttempts = (
  settings: TitleGenerationSettings,
): TitleGenerationAttempt[] => {
  const attempts: TitleGenerationAttempt[] = []
  const seen = new Set<string>()
  const requestedProvider = resolveTitleProvider(settings)
  const requestedTitleModel =
    typeof settings.titleModel === 'string' ? settings.titleModel.trim() : ''
  const activeProvider = normalizeProviderId(settings.modelProvider) as TitleProvider
  const activeModel = typeof settings.aiModel === 'string' ? settings.aiModel.trim() : ''

  const appendAttempt = (attempt: TitleGenerationAttempt | null) => {
    if (!attempt) return
    const key = `${attempt.provider}:${attempt.model}`
    if (seen.has(key)) return
    seen.add(key)
    attempts.push(attempt)
  }

  if (requestedTitleModel) {
    appendAttempt(buildTitleAttempt(settings, requestedProvider, requestedTitleModel))
    appendAttempt(buildTitleAttempt(settings, requestedProvider))
  } else {
    appendAttempt(buildTitleAttempt(settings, activeProvider, activeModel))
    appendAttempt(buildTitleAttempt(settings, requestedProvider))
  }

  if (activeProvider !== requestedProvider) {
    appendAttempt(buildTitleAttempt(settings, activeProvider, activeModel))
    appendAttempt(buildTitleAttempt(settings, activeProvider))
  }

  return attempts
}

const buildTitlePrompt = (userMessage: string, settings: TitleGenerationSettings): string => {
  const promptTemplate =
    typeof settings.titleGenerationPrompt === 'string' &&
    settings.titleGenerationPrompt.trim().length > 0
      ? settings.titleGenerationPrompt
      : defaultTitleGenerationPrompt

  const clippedUserMessage = userMessage.slice(0, 200).replace(/\s+/g, ' ').trim()
  if (/\{\{\s*userMessage\s*\}\}/i.test(promptTemplate)) {
    return promptTemplate.replace(/\{\{\s*userMessage\s*\}\}/gi, clippedUserMessage)
  }

  return `${promptTemplate}\n\nUser message: "${clippedUserMessage}"`
}

const stripOpenRouterPrefix = (modelId: string): string =>
  modelId.startsWith('openrouter/') ? modelId.replace('openrouter/', '') : modelId

async function generateTitleWithProvider(
  provider: TitleProvider,
  model: string,
  prompt: string,
  settings: TitleGenerationSettings,
): Promise<string> {
  if (provider === 'groq') {
    if (!settings.groqApiKey) throw new Error('Groq API key missing for title generation.')
    const result = await generateGroqCompletion(
      settings.groqApiKey,
      model,
      [{ role: 'user', content: prompt }],
      { temperature: 0.3 },
    )
    return result.choices?.[0]?.message?.content || ''
  }

  if (provider === 'perplexity') {
    if (!settings.perplexityApiKey)
      throw new Error('Perplexity API key missing for title generation.')
    const result = await generatePerplexityCompletion(
      settings.perplexityApiKey,
      model,
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 20 },
    )
    return result.choices?.[0]?.message?.content || ''
  }

  if (provider === 'ollama') {
    const ollamaUrl = settings.ollamaUrl?.trim()
    if (!ollamaUrl) throw new Error('Ollama URL missing for title generation.')
    const result = await generateOllamaCompletion(
      ollamaUrl,
      model,
      [{ role: 'user', content: prompt }],
      { temperature: 0.3 },
    )
    return result.message?.content || ''
  }

  if (provider === 'alibaba') {
    if (!settings.alibabaApiKey) throw new Error('Alibaba API key missing for title generation.')
    const result = await generateAlibabaCompletion(
      settings.alibabaApiKey,
      model,
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 20 },
    )
    return result.choices?.[0]?.message?.content || ''
  }

  if (provider === 'fireworks') {
    if (!settings.fireworksApiKey) throw new Error('Fireworks API key missing for title generation.')
    const result = await generateFireworksCompletion(
      settings.fireworksApiKey,
      model,
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 20 },
    )
    return result.choices?.[0]?.message?.content || ''
  }

  const openRouterKey = getOpenRouterApiKey(settings.openRouterApiKey)
  if (!openRouterKey) throw new Error('OpenRouter API key missing for title generation.')
  const result = await generateOpenRouterCompletion(
    openRouterKey,
    stripOpenRouterPrefix(model),
    [{ role: 'user', content: prompt }],
    { temperature: 0.3, max_tokens: 20 },
  )
  return result.choices?.[0]?.message?.content || ''
}

export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings,
): Promise<string> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const attempts = buildTitleGenerationAttempts(settings)
  const fallbackTitle = (() => {
    const words = userMessage.trim().split(/\s+/).slice(0, 3)
    return words.join(' ') + (userMessage.split(/\s+/).length > 3 ? '...' : '')
  })()

  if (attempts.length === 0) {
    console.warn('No title generation providers are currently available.')
    return fallbackTitle
  }

  for (const attempt of attempts) {
    try {
      const title = await generateTitleWithProvider(
        attempt.provider,
        attempt.model,
        prompt,
        settings,
      )

      const cleaned = sanitizeTitle(title)
      if (!cleaned) throw new Error('Empty generated title')

      const constrained = enforceThreeWords(cleaned)
      if (constrained.length < 2) throw new Error('Generated title too short')

      return constrained
    } catch (error) {
      console.warn(
        `[title-generator] Attempt failed for ${attempt.provider}/${attempt.model}:`,
        error,
      )
    }
  }

  return fallbackTitle
}
