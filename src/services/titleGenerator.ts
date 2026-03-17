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

const TITLE_FALLBACK_MODEL = 'google/gemini-2.0-flash-exp:free'

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

const resolveTitleModel = (settings: TitleGenerationSettings, provider: TitleProvider): string => {
  const requestedTitleModel = typeof settings.titleModel === 'string' ? settings.titleModel : ''
  const aiModel = typeof settings.aiModel === 'string' ? settings.aiModel : ''
  const providerModels = getProviderModels(settings, provider)
  const enabledProviderModels = providerModels.filter((model) => model.enabled !== false)
  const candidateModels = enabledProviderModels.length > 0 ? enabledProviderModels : providerModels

  if (requestedTitleModel && candidateModels.some((model) => model.code === requestedTitleModel)) {
    return requestedTitleModel
  }

  if (aiModel && candidateModels.some((model) => model.code === aiModel)) {
    return aiModel
  }

  if (candidateModels.length > 0) {
    return candidateModels[0].code
  }

  if (requestedTitleModel) {
    return requestedTitleModel
  }

  if (aiModel) {
    return aiModel
  }

  return TITLE_FALLBACK_MODEL
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
    if (!settings.perplexityApiKey) throw new Error('Perplexity API key missing for title generation.')
    const result = await generatePerplexityCompletion(
      settings.perplexityApiKey,
      model,
      [{ role: 'user', content: prompt }],
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
    { max_tokens: 20 },
  )
  return result.choices?.[0]?.message?.content || ''
}

/**
 * Generates a short title for a chat session from the first user message.
 */
export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings,
): Promise<string> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const titleProvider = resolveTitleProvider(settings)
  const titleModel = resolveTitleModel(settings, titleProvider)

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

    const openRouterKey = getOpenRouterApiKey(settings.openRouterApiKey)
    if (openRouterKey && !isRateLimitOrAuthError) {
      try {
        const fallbackResult = await generateOpenRouterCompletion(
          openRouterKey,
          TITLE_FALLBACK_MODEL,
          [{ role: 'user', content: prompt }],
          { max_tokens: 20 },
        )

        const fallbackTitle = fallbackResult.choices?.[0]?.message?.content || ''
        if (fallbackTitle) {
          return enforceThreeWords(sanitizeTitle(fallbackTitle))
        }
      } catch (fallbackError) {
        console.error('Fallback title generation failed:', fallbackError)
      }
    }

    const words = userMessage.trim().split(/\s+/).slice(0, 3)
    return words.join(' ') + (userMessage.split(/\s+/).length > 3 ? '...' : '')
  }
}
