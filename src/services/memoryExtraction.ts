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
> & { skills?: SkillsSettings }

export interface RunMemoryExtractionParams {
  settings: ExtractionSettings
  sessionId: string
  messages: ExtractionMessage[]
}

/** Result of a parsed extraction call (for testability). */
export interface ExtractionResult {
  facts: string[]
  summary: string
}

const MAX_MESSAGES = 12
const MAX_CHARS_PER_MESSAGE = 800
const MAX_FACTS = 8
const EXTRACTION_TIMEOUT_MS = 15_000

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
- NEVER extract secrets, passwords, API keys, tokens, financial account numbers, or other sensitive credentials.
- If there are no durable facts, return an empty "facts" array.
- Summary: write ONE short line ONLY if the chat reflects ongoing context worth carrying forward — an active project the user is working on, who the user is, their goals, or stable background. Keep it under 120 characters.
- Set "summary" to an empty string ("") when the chat is a one-off factual lookup, trivia, a definition, a calculation, or general Q&A with no lasting relevance to the user. When in doubt, prefer an empty summary over a trivial one.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"facts": ["fact one", "fact two"], "summary": "one line about this chat, or empty string"}`

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
export function parseExtractionResponse(raw: string): ExtractionResult | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as { facts?: unknown; summary?: unknown }
  const facts = Array.isArray(obj.facts)
    ? obj.facts
        .filter((f): f is string => typeof f === 'string')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .slice(0, MAX_FACTS)
    : []
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  return { facts, summary }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => reject(new Error('Memory extraction timed out')), ms)
      promise.finally(() => clearTimeout(id)).catch(() => undefined)
    }),
  ])
}

/**
 * Run the extraction pass and persist results. Best-effort: returns the parsed
 * result on success (handy for tests) or null on any failure/no-op. Never
 * throws.
 */
export async function runMemoryExtraction(
  params: RunMemoryExtractionParams
): Promise<ExtractionResult | null> {
  const { settings, sessionId, messages } = params

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
    raw = await withTimeout(generateTitleTextForModel(settings, model, prompt), EXTRACTION_TIMEOUT_MS)
  } catch (error) {
    console.warn('[memory-extraction] LLM call failed; skipping.', error)
    emitMemoryDiagnostic(sessionId, 'memory-extraction-error', {
      model,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  const result = parseExtractionResponse(raw)
  if (!result) {
    console.warn('[memory-extraction] Could not parse extraction response; skipping.')
    emitMemoryDiagnostic(sessionId, 'memory-extraction-error', {
      model,
      error: 'Could not parse extraction response',
    })
    return null
  }

  // Persist facts (ADD-only, deduped) — each is best-effort.
  for (const fact of result.facts) {
    try {
      await window.memory.addDeduped({ content: fact, source: 'model', sessionId })
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
