/**
 * "Dreaming" — background memory extraction.
 *
 * After a chat turn completes (idle/close), this runs a single-pass, ADD-only
 * LLM call that distills the recent conversation into:
 *   1. durable facts worth remembering about the user (saved memories), and
 *   2. a one-line summary of the chat (the "Recent activity" / Layer 2 store).
 *
 * Design choices (mirroring Mem0 v3 + ChatGPT reference-chat-history):
 * - Single LLM call, ADD-only: we never ask the model to overwrite/delete.
 *   Contradictions are handled downstream by `window.memory.addDeduped`, which
 *   dedupes near-duplicates and (when given a supersedesId) links instead of
 *   destroying. Here we keep it simple and let dedupe NOOP repeats.
 * - Token-efficient: only the tail of the conversation is sent, truncated.
 * - Best-effort + silent: any failure (no model, bad JSON, IPC error) is
 *   swallowed so it never disrupts the chat experience.
 *
 * Privacy: this sends recent chat content to whichever provider/model is
 * selected — the same trust boundary as the chat itself. Gated by the Memory
 * skill (and, in Task 7, the auto-management sub-toggle).
 */

import { isMemoryAutoManageEnabled, type SkillsSettings } from '@/skills'
import { generateTitleTextForModel } from '@/providers/providerRuntime'
import { appendChatDiagnosticEvent } from '@/diagnostics/chatDiagnosticsClient'
import type { ChatDiagnosticEvent } from '@/diagnostics/chatDiagnostics'
import type { SettingsConfig } from '@/contexts/SettingsConfigContext'
import type { MemoryCategory, MemoryScope } from '@/electron/types'
import {
  hasReminderOrLookoutIntent,
  isMemoryStorageEligibleFact,
  isReminderOrLookoutOnlyContext,
} from '@/utils/memoryReview'

export interface ExtractionMessage {
  role: 'user' | 'assistant'
  content: string
}

type ExtractionSettings = Partial<
  Pick<
    SettingsConfig,
    | 'aiModel'
    | 'titleModel'
    | 'memoryModel'
    | 'alibabaApiKey'
    | 'deepseekApiKey'
    | 'opencodeGoApiKey'
    | 'fireworksApiKey'
    | 'nvidiaApiKey'
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
    | 'nvidiaModels'
    | 'deepseekModels'
    | 'opencodeModels'
  >
> & { skills?: SkillsSettings }

export interface RunMemoryExtractionParams {
  settings: ExtractionSettings
  sessionId: string
  messages: ExtractionMessage[]
  scope?: MemoryScope
}

/** Result of a parsed extraction call (for testability). */
export interface ExtractionResult {
  facts: ExtractionFact[]
  summary: string
}

export interface ExtractionFact {
  content: string
  category: MemoryCategory
}

type ExtractionParseErrorCode =
  | 'empty-response'
  | 'missing-json-object'
  | 'invalid-json'
  | 'invalid-json-shape'

interface ExtractionParseFailure {
  errorCode: ExtractionParseErrorCode
  error: string
  responseLength: number
  responsePreview: string
}

type ExtractionParseOutcome =
  | { ok: true; result: ExtractionResult }
  | ({ ok: false } & ExtractionParseFailure)

const MAX_MESSAGES = 12
const MAX_CHARS_PER_MESSAGE = 800
const MAX_FACTS = 8
const EXTRACTION_TIMEOUT_MS = 30_000
const EXTRACTION_MAX_TOKENS = 1024
const RESPONSE_PREVIEW_CHARS = 500
const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  'preference',
  'project',
  'personal',
  'workflow',
  'context',
])

/**
 * Synthetic messageId for diagnostics. Background extraction has no assistant
 * messageId of its own; events are correlated by sessionId + timestamp instead.
 */
const MEMORY_DIAGNOSTIC_MESSAGE_ID = 'memory-extraction'

/**
 * Emit a dev-only chat-debug diagnostic for the background extraction pass.
 * No-op in production / when the IPC bridge is unavailable (guarded inside
 * {@link appendChatDiagnosticEvent}). Never throws.
 */
function emitMemoryDiagnostic(
  sessionId: string,
  phase: Extract<ChatDiagnosticEvent['phase'], `memory-extraction-${string}`>,
  extra: Partial<ChatDiagnosticEvent> = {}
): void {
  try {
    appendChatDiagnosticEvent({
      sessionId,
      messageId: MEMORY_DIAGNOSTIC_MESSAGE_ID,
      timestamp: Date.now(),
      phase,
      ...extra,
    })
  } catch {
    // Diagnostics are best-effort; never disrupt extraction.
  }
}

const EXTRACTION_INSTRUCTION = `You are a memory extraction system. Read the conversation and extract durable, long-term facts about the USER that are worth remembering across future chats (preferences, goals, projects, background, stable context). Also write a short "Recent activity" summary line, but ONLY when the chat carries continuity worth surfacing in future conversations.

Rules:
- ADD-only: state facts as standalone sentences. Do not reference previous memories.
- Only durable facts. Ignore one-off questions, ephemeral task details, and small talk.
- Prefer stable user preferences, durable project context, recurring workflows, and explicit self-descriptions.
- Rewrite facts as concise standalone memories about the user. Do not preserve chat transcript wording.
- Avoid memories about the assistant, the model, tool behavior, or one-time task outcomes unless they describe an ongoing user project.
- Do not extract reminders, alarms, follow-ups, check-ins, calendar-like requests, scheduled tasks, due dates, or notification requests. Those belong to the Reminders feature, not Memory.
- Do not extract web lookouts, page monitoring, "watch this URL", change detection, or URL-checking requests. Those belong to the Reminders & Lookouts feature.
- Do not extract one-off statements asking the assistant to remember/save something when the content is a reminder, task, alarm, follow-up, or lookout request.
- NEVER extract secrets, passwords, API keys, tokens, financial account numbers, government IDs, precise home/work addresses, private health details, biometric data, or other sensitive credentials.
- Do not extract sensitive personal attributes such as religion, politics, sexuality, race, medical status, or financial hardship unless the user explicitly asks the assistant to remember it and it is clearly useful for future help.
- If there are no durable facts, return an empty "facts" array.
- Summary: write ONE short line ONLY if the chat reflects ongoing context worth carrying forward — an active project the user is working on, who the user is, their goals, or stable background. Keep it under 120 characters.
- Set "summary" to an empty string ("") when the chat is a one-off factual lookup, trivia, a definition, a calculation, or general Q&A with no lasting relevance to the user. When in doubt, prefer an empty summary over a trivial one.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"facts": [{"content": "fact one", "category": "preference"}], "summary": "one line about this chat, or empty string"}`

function normalizeMemoryCategory(value: unknown): MemoryCategory {
  return typeof value === 'string' && MEMORY_CATEGORIES.has(value as MemoryCategory)
    ? (value as MemoryCategory)
    : 'context'
}

function filterExtractionResultForStorage(
  result: ExtractionResult,
  conversation: string
): ExtractionResult {
  const facts = result.facts.filter((fact) => isMemoryStorageEligibleFact(fact.content))
  const summary =
    result.summary &&
    (isReminderOrLookoutOnlyContext(conversation) || hasReminderOrLookoutIntent(result.summary))
      ? ''
      : result.summary
  return { facts, summary }
}

function buildResponsePreview(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, RESPONSE_PREVIEW_CHARS)
}

function buildParseFailure(
  raw: string,
  errorCode: ExtractionParseErrorCode,
  error: string
): ExtractionParseOutcome {
  return {
    ok: false,
    errorCode,
    error,
    responseLength: raw.length,
    responsePreview: buildResponsePreview(raw),
  }
}

function buildConversationText(messages: ExtractionMessage[]): string {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => {
      const text = m.content.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS_PER_MESSAGE)
      return `${m.role === 'user' ? 'User' : 'Assistant'}: ${text}`
    })
    .filter((line) => line.length > 6)
    .join('\n')
}

/**
 * Parse the model's response into an {@link ExtractionResult}. Tolerant of
 * surrounding prose / code fences by extracting the first balanced-ish JSON
 * object. Returns null when nothing usable is found.
 */
function parseExtractionResponseDetailed(raw: string): ExtractionParseOutcome {
  if (typeof raw !== 'string' || !raw.trim()) {
    return buildParseFailure(
      '',
      'empty-response',
      'Memory extraction model returned an empty response'
    )
  }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return buildParseFailure(
      raw,
      'missing-json-object',
      'Memory extraction response did not contain a JSON object'
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return buildParseFailure(
      raw,
      'invalid-json',
      `Memory extraction response contained invalid JSON: ${detail}`
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return buildParseFailure(
      raw,
      'invalid-json-shape',
      'Memory extraction JSON was not an object with facts/summary fields'
    )
  }
  const obj = parsed as { facts?: unknown; summary?: unknown }
  const facts = Array.isArray(obj.facts)
    ? obj.facts
        .map((fact): ExtractionFact | null => {
          if (typeof fact === 'string') {
            const content = fact.trim()
            return content ? { content, category: 'context' } : null
          }
          if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return null
          const raw = fact as { content?: unknown; category?: unknown }
          if (typeof raw.content !== 'string') return null
          const content = raw.content.trim()
          if (!content) return null
          return { content, category: normalizeMemoryCategory(raw.category) }
        })
        .filter((fact): fact is ExtractionFact => Boolean(fact))
        .slice(0, MAX_FACTS)
    : []
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  return { ok: true, result: { facts, summary } }
}

export function parseExtractionResponse(raw: string): ExtractionResult | null {
  const parsed = parseExtractionResponseDetailed(raw)
  return parsed.ok ? parsed.result : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

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
      throw new Error(`Memory extraction timed out after ${Math.round(ms / 1000)}s`, {
        cause: error,
      })
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Run the extraction pass and persist results. Best-effort: returns the parsed
 * result on success (handy for tests) or null on any failure/no-op. Never
 * throws.
 */
export async function runMemoryExtraction(
  params: RunMemoryExtractionParams
): Promise<ExtractionResult | null> {
  const { settings, sessionId, messages, scope = { type: 'global' } } = params

  // Gate: memory skill enabled AND auto-management on (manual-only pauses dreaming).
  if (!isMemoryAutoManageEnabled(settings.skills)) return null
  if (typeof window === 'undefined' || !window.memory) return null
  if (!sessionId || !Array.isArray(messages) || messages.length === 0) return null

  // Resolve the model: a dedicated `memoryModel` override wins; when unset we
  // fall back to the active chat model (the documented default, same model the
  // chat is already using). This is an explicit default, not an error-masking
  // fallback — if the resolved model's call fails, extraction stays best-effort.
  const configuredMemoryModel =
    typeof settings.memoryModel === 'string' ? settings.memoryModel.trim() : ''
  const activeModel = typeof settings.aiModel === 'string' ? settings.aiModel.trim() : ''
  const model = configuredMemoryModel || activeModel
  if (!model) return null

  const conversation = buildConversationText(messages)
  if (!conversation) return null

  const prompt = `${EXTRACTION_INSTRUCTION}\n\nConversation:\n${conversation}`

  emitMemoryDiagnostic(sessionId, 'memory-extraction-start', {
    model,
    messageCount: messages.length,
  })

  let raw: string
  try {
    raw = await withAbortTimeout(
      (signal) =>
        generateTitleTextForModel(settings, model, prompt, {
          signal,
          maxTokens: EXTRACTION_MAX_TOKENS,
          jsonMode: true,
        }),
      EXTRACTION_TIMEOUT_MS
    )
  } catch (error) {
    console.warn('[memory-extraction] LLM call failed; skipping.', error)
    emitMemoryDiagnostic(sessionId, 'memory-extraction-error', {
      model,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  const parsed = parseExtractionResponseDetailed(raw)
  if (!parsed.ok) {
    console.warn('[memory-extraction] Could not parse extraction response; skipping.', parsed)
    emitMemoryDiagnostic(sessionId, 'memory-extraction-error', {
      model,
      error: parsed.error,
      memoryErrorCode: parsed.errorCode,
      responseLength: parsed.responseLength,
      responsePreview: parsed.responsePreview,
    })
    return null
  }
  const result = filterExtractionResultForStorage(parsed.result, conversation)

  // Persist facts (ADD-only, deduped) — each is best-effort.
  for (const fact of result.facts) {
    try {
      await window.memory.addDeduped({
        content: fact.content,
        category: fact.category,
        source: 'model',
        sessionId,
        origin: 'background',
        scope,
      })
    } catch (error) {
      console.warn('[memory-extraction] Failed to persist a fact; continuing.', error)
    }
  }

  // Upsert the one-line conversation summary (Layer 2).
  if (result.summary) {
    try {
      await window.memory.summaries.upsert(sessionId, result.summary)
    } catch (error) {
      console.warn('[memory-extraction] Failed to upsert conversation summary.', error)
    }
  }

  emitMemoryDiagnostic(sessionId, 'memory-extraction-result', {
    model,
    factCount: result.facts.length,
    summaryKept: Boolean(result.summary),
  })

  return result
}
