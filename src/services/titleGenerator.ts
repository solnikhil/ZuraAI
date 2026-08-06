import { defaultTitleGenerationPrompt } from '../prompts/defaultTitleGenerationPrompt'
import type { SettingsConfig } from '../contexts/SettingsConfigContext'
import { generateTitleTextForModel } from '../providers/providerRuntime'
import { isLikelyBadGeneratedTitle } from '../utils/chatTitleRepair'

type TitleGenerationSettings = Partial<
  Pick<
    SettingsConfig,
    | 'titleModel'
    | 'titleGenerationPrompt'
    | 'alibabaApiKey'
    | 'deepseekApiKey'
    | 'opencodeGoApiKey'
    | 'fireworksApiKey'
    | 'nvidiaApiKey'
    | 'groqApiKey'
    | 'ollamaUrl'
    | 'openRouterApiKey'
    | 'configuredModels'
    | 'ollamaModels'
    | 'groqModels'
    | 'alibabaModels'
    | 'fireworksModels'
    | 'nvidiaModels'
    | 'deepseekModels'
    | 'opencodeModels'
  >
>

const MAX_TITLE_WORDS = 6
const TITLE_GENERATION_TIMEOUT_MS = 10_000

const TITLE_PREFIX_PATTERNS: RegExp[] = [
  /^\s*(?:here(?:'s| is)\s+(?:the\s+)?)?title\s*[:-]\s*/i,
  /^\s*suggested\s+title\s*[:-]\s*/i,
  /^\s*chat\s+title\s*[:-]\s*/i,
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
  const words = title
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  if (words.length === 0) return ''
  if (words.length <= max) return words.join(' ')
  return words.slice(0, max).join(' ')
}

function isInvalidTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase()
  if (!normalized) return true
  if (normalized.length < 2) return true
  if (isLikelyBadGeneratedTitle(title)) return true

  return false
}

const sanitizeTitle = (title: string): string => {
  const lines = title.split(/\r?\n/).map((line) => line.trim())

  const cleanLine = (raw: string): string => {
    if (/^```/.test(raw)) return ''
    const deMarked = raw.replace(/^#+\s+/, '').replace(/^[-*]\s+/, '')
    const unquoted = deMarked.trim().replace(/^["'`]+|["'`]+$/g, '')
    const dePrefixed = stripTitlePrefixes(unquoted)
    return dePrefixed
      .trim()
      .replace(/[\s"'`]+$/g, '')
      .replace(/[:.!?]+$/g, '')
      .trim()
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

  if (isInvalidTitle(cleaned)) {
    throw new Error('Invalid generated title')
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Run `run` under a deadline that actually cancels the underlying provider
 * request.
 *
 * Racing the returned promise is not enough: the provider request would keep
 * running for the full main-process runtime deadline after the UI gave up,
 * holding an active request slot and burning potentially billable tokens. This
 * mirrors the AbortController pattern used by memory extraction.
 */
async function withAbortTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ms)

  try {
    return await run(controller.signal)
  } catch (error) {
    if (controller.signal.aborted && isAbortError(error)) {
      throw new Error('Title generation timed out', { cause: error })
    }
    throw error
  } finally {
    // Settling normally must not leave a pending abort that could fire later.
    clearTimeout(timeoutId)
  }
}

export const generateChatTitle = async (
  userMessage: string,
  settings: TitleGenerationSettings
): Promise<string | null> => {
  const prompt = buildTitlePrompt(userMessage, settings)
  const model = typeof settings.titleModel === 'string' ? settings.titleModel.trim() : ''

  if (!model) {
    console.warn(
      '[title-generator] No dedicated title model is configured. Keeping existing chat title.'
    )
    return null
  }

  try {
    const title = await withAbortTimeout(
      (signal) => generateTitleTextForModel(settings, model, prompt, { signal }),
      TITLE_GENERATION_TIMEOUT_MS
    )
    return normalizeGeneratedTitle(title)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error || 'Unknown title generation error')
    console.warn(
      `[title-generator] Title generation failed for model "${model}". Keeping existing chat title. ${message}`
    )
    return null
  }
}
