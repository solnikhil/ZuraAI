import { generateGroqCompletion } from './groq'
import { generateAlibabaCompletion } from './alibaba'
import { generateOllamaCompletion } from './ollama'
import { generatePerplexityCompletion } from './perplexity'
import { generateOpenRouterCompletion } from './openrouter'
import { getOpenRouterApiKey } from '../utils/openRouterKey'
import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import type { ConfiguredModel, SettingsConfig } from '../contexts/SettingsConfigContext'

type TitleProvider = 'openrouter' | 'ollama' | 'perplexity' | 'groq' | 'alibaba'

type TitleGenerationSettings = Partial<
  Pick<
    SettingsConfig,
    | 'titleModelProvider'
    | 'modelProvider'
    | 'titleModel'
    | 'aiModel'
    | 'titleGenerationPrompt'
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'groqApiKey'
    | 'alibabaApiKey'
    | 'ollamaUrl'
    | 'configuredModels'
    | 'ollamaModels'
    | 'perplexityModels'
    | 'groqModels'
    | 'alibabaModels'
  >
>

const TITLE_PROVIDERS: TitleProvider[] = ['openrouter', 'ollama', 'perplexity', 'groq', 'alibaba']
const PROVIDER_MODEL_KEYS = {
  openrouter: 'configuredModels',
  ollama: 'ollamaModels',
  perplexity: 'perplexityModels',
  groq: 'groqModels',
  alibaba: 'alibabaModels',
} as const

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
  if (isTitleProvider(settings.titleModelProvider)) {
    return settings.titleModelProvider
  }
  if (isTitleProvider(settings.modelProvider)) {
    return settings.modelProvider
  }
  return 'openrouter'
}

const getProviderModels = (
  settings: TitleGenerationSettings,
  provider: TitleProvider,
): ConfiguredModel[] => {
  const rawModels = settings[PROVIDER_MODEL_KEYS[provider]]

  if (!Array.isArray(rawModels)) return []

  return rawModels.filter((model): model is ConfiguredModel => {
    return Boolean(model && typeof model.code === 'string' && model.code.length > 0)
  })
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

const resolveTitleModel = (
  settings: TitleGenerationSettings,
  provider: TitleProvider,
): { model: string; fromFallback: boolean } => {
  const requestedTitleModel = typeof settings.titleModel === 'string' ? settings.titleModel : ''
  const aiModel = typeof settings.aiModel === 'string' ? settings.aiModel : ''
  const providerModels = getProviderModels(settings, provider)
  const enabledProviderModels = providerModels.filter((model) => model.enabled !== false)
  const candidateModels = enabledProviderModels.length > 0 ? enabledProviderModels : providerModels

  if (requestedTitleModel && candidateModels.some((model) => model.code === requestedTitleModel)) {
    return { model: requestedTitleModel, fromFallback: false }
  }

  if (aiModel && candidateModels.some((model) => model.code === aiModel)) {
    return { model: aiModel, fromFallback: false }
  }

  if (candidateModels.length > 0) {
    return { model: candidateModels[0].code, fromFallback: false }
  }

  const firstAvailable = getFirstAvailableModel(settings, provider)
  if (firstAvailable) {
    return { model: firstAvailable, fromFallback: true }
  }

  return { model: '', fromFallback: true }
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
    if (!settings.ollamaUrl) throw new Error('Ollama URL missing for title generation.')
    const result = await generateOllamaCompletion(
      settings.ollamaUrl,
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

function hasApiKeyForProvider(settings: TitleGenerationSettings, provider: TitleProvider): boolean {
  switch (provider) {
    case 'groq':
      return !!settings.groqApiKey
    case 'perplexity':
      return !!settings.perplexityApiKey
    case 'ollama':
      return !!settings.ollamaUrl
    case 'alibaba':
      return !!settings.alibabaApiKey
    case 'openrouter':
      return !!getOpenRouterApiKey(settings.openRouterApiKey)
    default:
      return false
  }
}

export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings,
): Promise<string> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const titleProvider = resolveTitleProvider(settings)
  const { model: titleModel, fromFallback } = resolveTitleModel(settings, titleProvider)

  if (!titleModel) {
    console.warn('No title model available for provider', titleProvider)
    const words = userMessage.trim().split(/\s+/).slice(0, 3)
    return words.join(' ') + (userMessage.split(/\s+/).length > 3 ? '...' : '')
  }

  try {
    const title = await generateTitleWithProvider(titleProvider, titleModel, prompt, settings)

    const cleaned = sanitizeTitle(title)
    if (!cleaned) throw new Error('Empty title from primary provider')

    const constrained = enforceThreeWords(cleaned)
    if (constrained.length < 2) throw new Error('Generated title too short')

    return constrained
  } catch (error) {
    console.error('Primary title generation failed:', error)

    const errorMessage = error instanceof Error ? error.message : ''
    const isRateLimitOrAuthError =
      errorMessage.includes('429') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.toLowerCase().includes('rate')

    if (!fromFallback && getFirstAvailableModel(settings, titleProvider)) {
      const fallbackModel = getFirstAvailableModel(settings, titleProvider)
      if (fallbackModel && fallbackModel !== titleModel && !isRateLimitOrAuthError) {
        try {
          const fallbackTitle = await generateTitleWithProvider(
            titleProvider,
            fallbackModel,
            prompt,
            settings,
          )
          const cleaned = sanitizeTitle(fallbackTitle)
          if (cleaned) {
            return enforceThreeWords(cleaned)
          }
        } catch (fallbackError) {
          console.error('Fallback model title generation failed:', fallbackError)
        }
      }
    }

    const configuredProviders: TitleProvider[] = TITLE_PROVIDERS.filter(
      (p) => p !== titleProvider && hasApiKeyForProvider(settings, p) && getFirstAvailableModel(settings, p),
    )

    for (const altProvider of configuredProviders) {
      try {
        const altModel = getFirstAvailableModel(settings, altProvider)
        if (!altModel) continue

        const altTitle = await generateTitleWithProvider(altProvider, altModel, prompt, settings)
        const cleaned = sanitizeTitle(altTitle)
        if (cleaned) {
          return enforceThreeWords(cleaned)
        }
      } catch (altError) {
        console.error(`Alternative provider ${altProvider} title generation failed:`, altError)
      }
    }

    const words = userMessage.trim().split(/\s+/).slice(0, 3)
    return words.join(' ') + (userMessage.split(/\s+/).length > 3 ? '...' : '')
  }
}