import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import type { SettingsConfig } from '../contexts/SettingsConfigContext'
import { generateTitleTextForModel } from '../providers/providerRuntime'

type TitleGenerationSettings = Partial<
  Pick<
    SettingsConfig,
    | 'titleModel'
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

const MAX_TITLE_WORDS = 6
const TITLE_GENERATION_TIMEOUT_MS = 10_000
const TITLE_FALLBACK = 'New Chat'

const TITLE_PREFIX_PATTERNS: RegExp[] = [
  /^\s*(?:here(?:'s| is)\s+(?:the\s+)?)?title\s*[:\-]\s*/i,
  /^\s*suggested\s+title\s*[:\-]\s*/i,
  /^\s*chat\s+title\s*[:\-]\s*/i,
]

function stripTitlePrefixes(value: string): string {
  let out = value
  for (let i = 0; i < 3; i += 1) {
    const next = TITLE_PREFIX_PATTERNS.reduce((acc, regex) => acc.replace(regex, ''), out)
    if (next === out) break
    out = next
  }
  return out
}

const enforceMaxWords = (title: string, max: number = MAX_TITLE_WORDS): string => {
  const words = title.trim().split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return ''
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
  if (normalized.includes("i'm unable")) return true
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
    "here's a title",
    "here's the title",
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

function normalizeGeneratedTitle(title: string): string {
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
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Title generation timed out'))
      }, ms)

      promise.finally(() => clearTimeout(timeoutId)).catch(() => undefined)
    }),
  ])
}

export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings
): Promise<string> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const model = typeof settings.titleModel === 'string' ? settings.titleModel.trim() : ''

  if (!model) {
    console.warn('[title-generator] No dedicated title model is configured. Resetting title to "New Chat".')
    return TITLE_FALLBACK
  }

  try {
    const title = await withTimeout(generateTitleTextForModel(settings, model, prompt), TITLE_GENERATION_TIMEOUT_MS)
    return normalizeGeneratedTitle(title)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown title generation error')
    console.warn(
      `[title-generator] Title generation failed for model "${model}". Resetting title to "${TITLE_FALLBACK}". ${message}`
    )
    return TITLE_FALLBACK
  }
}
