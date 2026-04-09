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
import { generateProviderTitleText } from '../providers/providerRuntime'

type TitleProvider = ActiveProviderId

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

type TitleGenerationAttempt = {
  provider: TitleProvider
  model: string
  priority: number
}

type TitleGenerationErrorKind =
  | 'provider-auth'
  | 'provider-quota'
  | 'provider-rate-limit'
  | 'provider-forbidden'
  | 'model-empty'
  | 'model-invalid'
  | 'transient'
  | 'unknown'

type TitleGenerationFailure = {
  attempt: TitleGenerationAttempt
  kind: TitleGenerationErrorKind
  message: string
}

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

const sanitizeTitle = (title: string): string =>
  title.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/g, '')

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
  provider: TitleProvider
): ConfiguredModel[] =>
  getTitleEligibleModels(
    getProviderModelsFromRegistry(settings, provider).filter((model): model is ConfiguredModel =>
      Boolean(model && typeof model.code === 'string' && model.code.length > 0)
    )
  )

function buildFallbackTitle(userMessage: string): string {
  const words = userMessage.trim().split(/\s+/).filter(Boolean).slice(0, 3)
  if (words.length === 0) return 'New Chat'
  return words.join(' ') + (userMessage.trim().split(/\s+/).filter(Boolean).length > 3 ? '...' : '')
}

function buildTitlePrompt(userMessage: string, settings: TitleGenerationSettings): string {
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

function getOrderedProviders(settings: TitleGenerationSettings): TitleProvider[] {
  const requestedProvider = resolveTitleProvider(settings)
  const activeProvider = normalizeProviderId(settings.modelProvider) as TitleProvider
  const ordered: TitleProvider[] = []

  const pushProvider = (provider: TitleProvider) => {
    if (!ordered.includes(provider)) {
      ordered.push(provider)
    }
  }

  pushProvider(requestedProvider)
  pushProvider(activeProvider)

  for (const provider of TITLE_PROVIDERS) {
    pushProvider(provider)
  }

  return ordered
}

function getProviderCandidateModels(
  settings: TitleGenerationSettings,
  provider: TitleProvider
): string[] {
  const providerModels = getProviderModels(settings, provider)
  const enabledModels = providerModels.filter((model) => model.enabled !== false)
  const candidateModels = enabledModels.length > 0 ? enabledModels : providerModels
  return candidateModels.map((model) => model.code.trim()).filter(Boolean)
}

function buildTitleGenerationAttempts(settings: TitleGenerationSettings): TitleGenerationAttempt[] {
  const requestedProvider = resolveTitleProvider(settings)
  const activeProvider = normalizeProviderId(settings.modelProvider) as TitleProvider
  const requestedTitleModel =
    typeof settings.titleModel === 'string' ? settings.titleModel.trim() : ''
  const activeModel = typeof settings.aiModel === 'string' ? settings.aiModel.trim() : ''
  const attempts: TitleGenerationAttempt[] = []
  const seen = new Set<string>()

  const appendAttempt = (provider: TitleProvider, model: string, priority: number) => {
    const normalizedModel = model.trim()
    if (!normalizedModel) return
    if (!hasProviderAccess(settings, provider)) return

    const key = `${provider}:${normalizedModel}`
    if (seen.has(key)) return

    seen.add(key)
    attempts.push({ provider, model: normalizedModel, priority })
  }

  for (const provider of getOrderedProviders(settings)) {
    const candidateModels = getProviderCandidateModels(settings, provider)

    if (
      provider === requestedProvider &&
      requestedTitleModel &&
      candidateModels.includes(requestedTitleModel)
    ) {
      appendAttempt(provider, requestedTitleModel, 0)
    }

    if (provider === activeProvider && activeModel) {
      appendAttempt(provider, activeModel, provider === requestedProvider ? 1 : 0)
    }

    for (const model of candidateModels) {
      const priority =
        provider === requestedProvider
          ? 1
          : provider === activeProvider
            ? 2
            : 3
      appendAttempt(provider, model, priority)
    }
  }

  return attempts.sort((left, right) => left.priority - right.priority)
}

function classifyTitleGenerationError(error: unknown): { kind: TitleGenerationErrorKind; message: string } {
  const message = error instanceof Error ? error.message : String(error || 'Unknown title generation error')
  const normalized = message.toLowerCase()

  if (
    /\b401\b/.test(normalized) ||
    normalized.includes('unauthorized') ||
    normalized.includes('api key missing') ||
    normalized.includes('api key is missing') ||
    normalized.includes('missing for title generation')
  ) {
    return { kind: 'provider-auth', message }
  }

  if (
    /\b403\b/.test(normalized) &&
    (normalized.includes('limit') || normalized.includes('quota') || normalized.includes('credit'))
  ) {
    return { kind: 'provider-quota', message }
  }

  if (/\b429\b/.test(normalized) || normalized.includes('rate limit')) {
    return { kind: 'provider-rate-limit', message }
  }

  if (/\b403\b/.test(normalized) || normalized.includes('forbidden')) {
    return { kind: 'provider-forbidden', message }
  }

  if (normalized.includes('empty generated title')) {
    return { kind: 'model-empty', message }
  }

  if (normalized.includes('generated title too short') || normalized.includes('model not found')) {
    return { kind: 'model-invalid', message }
  }

  if (
    /\b408\b|\b500\b|\b502\b|\b503\b|\b504\b|\b529\b/.test(normalized) ||
    normalized.includes('timeout') ||
    normalized.includes('temporar') ||
    normalized.includes('upstream') ||
    normalized.includes('network')
  ) {
    return { kind: 'transient', message }
  }

  return { kind: 'unknown', message }
}

function shouldSkipProviderAfterFailure(kind: TitleGenerationErrorKind): boolean {
  return (
    kind === 'provider-auth' ||
    kind === 'provider-quota' ||
    kind === 'provider-rate-limit' ||
    kind === 'provider-forbidden'
  )
}

async function generateTitleWithProvider(
  provider: TitleProvider,
  model: string,
  prompt: string,
  settings: TitleGenerationSettings
): Promise<string> {
  return generateProviderTitleText(settings, provider, model, prompt)
}

function logTitleGenerationFailures(failures: TitleGenerationFailure[], fallbackTitle: string): void {
  if (failures.length === 0) return

  const summary = failures
    .map((failure) => `${failure.attempt.provider}/${failure.attempt.model} [${failure.kind}] ${failure.message}`)
    .join(' | ')

  console.warn(`[title-generator] All attempts failed. Using fallback "${fallbackTitle}". ${summary}`)
}

export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings
): Promise<string> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const fallbackTitle = buildFallbackTitle(userMessage)
  const attempts = buildTitleGenerationAttempts(settings)

  if (attempts.length === 0) {
    console.warn('No title generation providers are currently available.')
    return fallbackTitle
  }

  const blockedProviders = new Set<TitleProvider>()
  const failures: TitleGenerationFailure[] = []

  for (const attempt of attempts) {
    if (blockedProviders.has(attempt.provider)) {
      continue
    }

    try {
      const title = await generateTitleWithProvider(attempt.provider, attempt.model, prompt, settings)
      const cleaned = sanitizeTitle(title)

      if (!cleaned) {
        throw new Error('Empty generated title')
      }

      const constrained = enforceThreeWords(cleaned)
      if (constrained.length < 2) {
        throw new Error('Generated title too short')
      }

      return constrained
    } catch (error) {
      const classified = classifyTitleGenerationError(error)
      failures.push({
        attempt,
        kind: classified.kind,
        message: classified.message,
      })

      if (shouldSkipProviderAfterFailure(classified.kind)) {
        blockedProviders.add(attempt.provider)
      }
    }
  }

  logTitleGenerationFailures(failures, fallbackTitle)
  return fallbackTitle
}
