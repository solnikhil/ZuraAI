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
    | 'deepseekApiKey'
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
    | 'deepseekModels'
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

const MAX_TITLE_WORDS = 6
const TITLE_GENERATION_TIMEOUT_MS = 10_000

const enforceMaxWords = (title: string, max: number = MAX_TITLE_WORDS): string => {
  const words = title.trim().split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return 'New Chat Session'
  if (words.length <= max) return words.join(' ')
  return words.slice(0, max).join(' ')
}

function isInvalidTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase()
  if (!normalized) return true
  if (normalized.length < 2) return true

  if (normalized.includes('does not support')) return true
  if (normalized.includes('does not allow')) return true
  if (normalized.includes('cannot read')) return true
  if (normalized.includes('cannot access')) return true
  if (normalized.includes('error:')) return true
  if (normalized.includes('inform the user')) return true
  if (normalized.includes('i cannot')) return true
  if (normalized.includes('i\'m unable')) return true
  if (normalized.includes('i am unable')) return true
  if (normalized.includes('not supported')) return true
  if (normalized.includes('image input')) return true
  if (normalized.includes('clipboard')) return true
  if (/^sorry/i.test(normalized)) return true
  if (/^apologi/i.test(normalized)) return true

  const instructionPhrases = [
    'generate a title',
    'generate title',
    'generate a short',
    'create a title',
    'make a title',
    'write a title',
    'return a title',
    'give this conversation',
    'here is a title',
    'here is the title',
    'here\'s a title',
    'here\'s the title',
    'suggested title',
    'chat title',
  ]
  if (instructionPhrases.some((phrase) => normalized === phrase)) return true

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= 6) {
    const hasTitleWord = words.includes('title') || words.includes('titles')
    const hasInstructionVerb = words.some((w) =>
      w === 'generate' || w === 'create' || w === 'make' || w === 'write' || w === 'return' || w === 'give'
    )
    if (hasTitleWord && hasInstructionVerb) return true
  }

  return false
}

const TITLE_PREFIX_PATTERNS: RegExp[] = [
  /^\s*(?:here(?:'s| is)\s+(?:the\s+)?)?title\s*[:\-]\s*/i,
  /^\s*suggested\s+title\s*[:\-]\s*/i,
  /^\s*chat\s+title\s*[:\-]\s*/i,
]

function stripTitlePrefixes(value: string): string {
  let out = value
  for (let i = 0; i < 3; i++) {
    const next = TITLE_PREFIX_PATTERNS.reduce((acc, regex) => acc.replace(regex, ''), out)
    if (next === out) break
    out = next
  }
  return out
}

const sanitizeTitle = (title: string): string => {
  const lines = title.split(/\r?\n/).map((line) => line.trim())

  const cleanLine = (raw: string): string => {
    const deMarked = raw.replace(/^#+\s+/, '').replace(/^[-*]\s+/, '')
    const unquoted = deMarked.trim().replace(/^["'`]+|["'`]+$/g, '')
    const dePrefixed = stripTitlePrefixes(unquoted)
    return dePrefixed.trim().replace(/[\s"'`]+$/g, '').replace(/[:.!?]+$/g, '').trim()
  }

  for (const raw of lines) {
    if (!raw) continue
    const cleaned = cleanLine(raw)
    if (cleaned) return cleaned
  }

  return cleanLine(title.trim())
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
  provider: TitleProvider
): ConfiguredModel[] =>
  getTitleEligibleModels(
    getProviderModelsFromRegistry(settings, provider).filter((model): model is ConfiguredModel =>
      Boolean(model && typeof model.code === 'string' && model.code.length > 0)
    )
  )

function buildFallbackTitle(userMessage: string): string {
  const cleanedMessage = stripTitlePrefixes(userMessage.trim())
  const words = cleanedMessage.trim().split(/\s+/).filter(Boolean).slice(0, MAX_TITLE_WORDS)
  if (words.length === 0) return 'New Chat'
  const totalWords = cleanedMessage.trim().split(/\s+/).filter(Boolean).length
  return words.join(' ') + (totalWords > MAX_TITLE_WORDS ? '...' : '')
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

  return `${promptTemplate}\n\nUser's first message:\n${clippedUserMessage}`
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

  if (requestedTitleModel && hasProviderAccess(settings, requestedProvider)) {
    const candidateModels = getProviderCandidateModels(settings, requestedProvider)
    if (candidateModels.includes(requestedTitleModel)) {
      appendAttempt(requestedProvider, requestedTitleModel, 0)
    }
  }

  if (activeModel && activeProvider !== requestedProvider) {
    appendAttempt(activeProvider, activeModel, 1)
  }

  if (attempts.length === 0) {
    const firstCandidateModel = getProviderCandidateModels(settings, requestedProvider)[0]
    if (firstCandidateModel) {
      appendAttempt(requestedProvider, firstCandidateModel, 0)
    }
  }

  if (attempts.length === 0 && activeProvider !== requestedProvider) {
    const firstCandidateModel = getProviderCandidateModels(settings, activeProvider)[0]
    if (firstCandidateModel) {
      appendAttempt(activeProvider, firstCandidateModel, 1)
    }
  }

  for (const provider of TITLE_PROVIDERS) {
    if (provider === requestedProvider || provider === activeProvider) continue
    const firstCandidateModel = getProviderCandidateModels(settings, provider)[0]
    if (firstCandidateModel) {
      appendAttempt(provider, firstCandidateModel, 2)
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

  if (normalized.includes('invalid generated title') || normalized.includes('prompt-echo title') || normalized.includes('instruction-like title')) {
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ms)
  return promise.finally(() => clearTimeout(timeoutId))
}

export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings
): Promise<string> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const fallbackTitle = buildFallbackTitle(userMessage)
  const attempts = buildTitleGenerationAttempts(settings)

  if (attempts.length === 0) {
    console.warn('[title-generator] No title generation providers are currently available.')
    return fallbackTitle
  }

  const blockedProviders = new Set<TitleProvider>()
  const failures: TitleGenerationFailure[] = []

  const generationPromise = (async (): Promise<string> => {
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

        const constrained = enforceMaxWords(cleaned)
        if (constrained.length < 2) {
          throw new Error('Generated title too short')
        }

        if (isInvalidTitle(constrained)) {
          throw new Error('Invalid generated title')
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
  })()

  return withTimeout(generationPromise, TITLE_GENERATION_TIMEOUT_MS).catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logTitleGenerationFailures(
        [{ attempt: attempts[0], kind: 'transient', message: 'Title generation timed out' }],
        fallbackTitle
      )
      return fallbackTitle
    }
    return fallbackTitle
  })
}
