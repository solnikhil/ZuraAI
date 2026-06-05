import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

import {
  CHAT_DIAGNOSTIC_MAX_BYTES,
  CHAT_DIAGNOSTIC_MAX_EVENTS,
  type ChatDiagnosticEvent,
  type ChatDiagnosticStreamChunk,
} from '../src/diagnostics/chatDiagnostics'

const STRING_LIMIT = 1_000
const TOOL_ARGUMENT_LIMIT = 500
const STREAM_TEXT_DELTA_LIMIT = 200
const VALID_PHASES = new Set([
  'context-optimized',
  'request-start',
  'request-shape',
  'round-start',
  'round-finish',
  'usage',
  'tool-start',
  'tool-complete',
  'provider-error',
  'finish',
  'stream-chunk',
  'research-state',
])
const VALID_CONTENT_TYPES = new Set(['text', 'parts', 'empty'])
const VALID_RESEARCH_STATES = new Set([
  'search',
  'synthesize',
  'recover-leaked-tool-call',
  'deterministic-answer',
])
const VALID_LEAKED_MARKUP_FORMATS = new Set(['dsml', 'xml'])

/**
 * Optional broadcaster used to push freshly-persisted diagnostic events to subscribers
 * (e.g. the in-app debug panel). Wired by main from `electron/main.ts`. Tests inject a
 * stub via {@link setChatDiagnosticBroadcaster}.
 */
export type ChatDiagnosticBroadcaster = (event: ChatDiagnosticEvent) => void

let broadcaster: ChatDiagnosticBroadcaster | null = null

export function setChatDiagnosticBroadcaster(fn: ChatDiagnosticBroadcaster | null): void {
  broadcaster = fn
}

function getDiagnosticsDir(): string {
  return path.join(app.getPath('userData'), 'debug-sessions')
}

function getDiagnosticFilePath(sessionId: string): string {
  return path.join(getDiagnosticsDir(), `${encodeURIComponent(sessionId)}.jsonl`)
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function truncateString(value: string, limit = STRING_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit)}...[truncated]` : value
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateString(value, TOOL_ARGUMENT_LIMIT)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`
    return value.slice(0, 12).map((item) => sanitizeValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[object]'
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (
        /api[_-]?key|authorization|secret|password|image|file|data|base64/i.test(key) ||
        /^(token|access[_-]?token|auth[_-]?token|bearer[_-]?token)$/i.test(key)
      ) {
        output[key] = '[redacted]'
        continue
      }
      output[key] = sanitizeValue(item, depth + 1)
    }
    return output
  }
  return String(value)
}

function sanitizeStreamChunk(input: unknown): ChatDiagnosticStreamChunk | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Partial<ChatDiagnosticStreamChunk>

  const chunkIndex = typeof raw.chunkIndex === 'number' && Number.isFinite(raw.chunkIndex)
    ? raw.chunkIndex
    : 0
  const cumulativeTextLength =
    typeof raw.cumulativeTextLength === 'number' && Number.isFinite(raw.cumulativeTextLength)
      ? raw.cumulativeTextLength
      : 0

  const sanitized: ChatDiagnosticStreamChunk = {
    chunkIndex,
    cumulativeTextLength,
  }

  if (typeof raw.textDelta === 'string') {
    sanitized.textDelta = truncateString(raw.textDelta, STREAM_TEXT_DELTA_LIMIT)
  }
  if (typeof raw.toolCallDeltaCount === 'number' && Number.isFinite(raw.toolCallDeltaCount)) {
    sanitized.toolCallDeltaCount = raw.toolCallDeltaCount
  }

  return sanitized
}

function sanitizeEvent(input: unknown): ChatDiagnosticEvent | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ChatDiagnosticEvent>
  if (typeof raw.sessionId !== 'string' || !raw.sessionId.trim()) return null
  if (typeof raw.messageId !== 'string' || !raw.messageId.trim()) return null
  if (typeof raw.phase !== 'string' || !VALID_PHASES.has(raw.phase)) return null

  return {
    sessionId: raw.sessionId.trim(),
    messageId: raw.messageId.trim(),
    timestamp: typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : Date.now(),
    phase: raw.phase,
    provider: typeof raw.provider === 'string' ? truncateString(raw.provider, 120) : undefined,
    model: typeof raw.model === 'string' ? truncateString(raw.model, 240) : undefined,
    round: typeof raw.round === 'number' && Number.isFinite(raw.round) ? raw.round : undefined,
    roundType: typeof raw.roundType === 'string' ? truncateString(raw.roundType, 80) : undefined,
    messageCount: typeof raw.messageCount === 'number' ? raw.messageCount : undefined,
    messages: Array.isArray(raw.messages)
      ? raw.messages.slice(0, 80).map((message) => ({
          role: typeof message.role === 'string' ? truncateString(message.role, 40) : 'unknown',
          contentType: VALID_CONTENT_TYPES.has(message.contentType)
            ? message.contentType
            : 'empty',
          textLength: typeof message.textLength === 'number' ? message.textLength : 0,
          textPreview: typeof message.textPreview === 'string'
            ? truncateString(message.textPreview, 240)
            : undefined,
          partTypes: Array.isArray(message.partTypes)
            ? message.partTypes.map((part) => truncateString(String(part), 40))
            : undefined,
        }))
      : undefined,
    context: raw.context && typeof raw.context === 'object'
      ? sanitizeValue(raw.context) as ChatDiagnosticEvent['context']
      : undefined,
    requestShape: raw.requestShape && typeof raw.requestShape === 'object'
      ? sanitizeValue(raw.requestShape) as ChatDiagnosticEvent['requestShape']
      : undefined,
    usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : undefined,
    rawUsage: raw.rawUsage && typeof raw.rawUsage === 'object'
      ? sanitizeValue(raw.rawUsage) as Record<string, unknown>
      : undefined,
    latency: typeof raw.latency === 'number' && Number.isFinite(raw.latency)
      ? raw.latency
      : undefined,
    finishReason: typeof raw.finishReason === 'string'
      ? truncateString(raw.finishReason, 120)
      : undefined,
    tool: raw.tool && typeof raw.tool === 'object'
      ? {
          id: typeof raw.tool.id === 'string' ? truncateString(raw.tool.id, 120) : undefined,
          name: typeof raw.tool.name === 'string' ? truncateString(raw.tool.name, 160) : 'unknown',
          arguments: raw.tool.arguments && typeof raw.tool.arguments === 'object'
            ? sanitizeValue(raw.tool.arguments) as Record<string, unknown>
            : undefined,
          success: typeof raw.tool.success === 'boolean' ? raw.tool.success : undefined,
          executionTime: typeof raw.tool.executionTime === 'number' ? raw.tool.executionTime : undefined,
          origin: typeof raw.tool.origin === 'string' ? truncateString(raw.tool.origin, 80) : undefined,
          error: typeof raw.tool.error === 'string' ? truncateString(raw.tool.error) : undefined,
        }
      : undefined,
    streamChunk: raw.phase === 'stream-chunk' ? sanitizeStreamChunk(raw.streamChunk) : undefined,
    researchState: typeof raw.researchState === 'string' && VALID_RESEARCH_STATES.has(raw.researchState)
      ? raw.researchState as ChatDiagnosticEvent['researchState']
      : undefined,
    leakedMarkupFormat: typeof raw.leakedMarkupFormat === 'string' && VALID_LEAKED_MARKUP_FORMATS.has(raw.leakedMarkupFormat)
      ? raw.leakedMarkupFormat as ChatDiagnosticEvent['leakedMarkupFormat']
      : undefined,
    recoveredQueryCount: typeof raw.recoveredQueryCount === 'number' && Number.isFinite(raw.recoveredQueryCount)
      ? raw.recoveredQueryCount
      : undefined,
    deterministicAnswerUsed: typeof raw.deterministicAnswerUsed === 'boolean'
      ? raw.deterministicAnswerUsed
      : undefined,
    searchBudgetRemaining: typeof raw.searchBudgetRemaining === 'number' && Number.isFinite(raw.searchBudgetRemaining)
      ? raw.searchBudgetRemaining
      : undefined,
    attemptedQueries: Array.isArray(raw.attemptedQueries)
      ? raw.attemptedQueries.slice(0, 16).map((query) => truncateString(String(query), 240))
      : undefined,
    executedQueries: Array.isArray(raw.executedQueries)
      ? raw.executedQueries.slice(0, 16).map((query) => truncateString(String(query), 240))
      : undefined,
    skippedReason: typeof raw.skippedReason === 'string'
      ? truncateString(raw.skippedReason, 160)
      : undefined,
    error: typeof raw.error === 'string' ? truncateString(raw.error) : undefined,
  }
}

async function pruneDiagnosticFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat) return

  if (stat.size <= CHAT_DIAGNOSTIC_MAX_BYTES) {
    const raw = await fs.readFile(filePath, 'utf8')
    const lines = raw.split('\n').filter(Boolean)
    if (lines.length <= CHAT_DIAGNOSTIC_MAX_EVENTS) return
    await fs.writeFile(filePath, `${lines.slice(-CHAT_DIAGNOSTIC_MAX_EVENTS).join('\n')}\n`)
    return
  }

  const raw = await fs.readFile(filePath, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  const kept: string[] = []
  let totalBytes = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const lineBytes = Buffer.byteLength(line) + 1
    if (kept.length >= CHAT_DIAGNOSTIC_MAX_EVENTS || totalBytes + lineBytes > CHAT_DIAGNOSTIC_MAX_BYTES) {
      break
    }
    kept.unshift(line)
    totalBytes += lineBytes
  }
  await fs.writeFile(filePath, `${kept.join('\n')}\n`)
}

export function isChatDiagnosticsEnabled(): boolean {
  return !app.isPackaged
}

export function getChatDebugReference(sessionId: unknown): string | null {
  if (!isChatDiagnosticsEnabled()) return null
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null

  const encodedUserDataPath = base64UrlEncode(app.getPath('userData'))
  return `zura-chat://${encodeURIComponent(sessionId.trim())}?userData=${encodedUserDataPath}`
}

export async function appendChatDiagnosticEvent(input: unknown): Promise<boolean> {
  if (!isChatDiagnosticsEnabled()) return false

  const event = sanitizeEvent(input)
  if (!event) return false

  await fs.mkdir(getDiagnosticsDir(), { recursive: true })
  const filePath = getDiagnosticFilePath(event.sessionId)
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`)
  await pruneDiagnosticFile(filePath)

  if (broadcaster) {
    try {
      broadcaster(event)
    } catch (error) {
      // Broadcasting is best-effort; never let a failed listener break persistence.
      console.warn('[chat-diagnostics] broadcaster failed', error)
    }
  }

  return true
}

/**
 * Read all persisted diagnostic events for a session. Used by the dev-only debug panel
 * to hydrate its initial event list. Returns `[]` when diagnostics are disabled, the
 * file is missing, or the sessionId is invalid.
 */
export async function readChatDiagnosticEvents(
  sessionId: unknown
): Promise<ChatDiagnosticEvent[]> {
  if (!isChatDiagnosticsEnabled()) return []
  if (typeof sessionId !== 'string' || !sessionId.trim()) return []

  const filePath = getDiagnosticFilePath(sessionId.trim())
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT') return []
    throw error
  }

  const events: ChatDiagnosticEvent[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    try {
      const parsed = JSON.parse(line) as ChatDiagnosticEvent
      events.push(parsed)
    } catch {
      // Skip malformed lines; persistence ahead may have been interrupted.
    }
  }
  return events
}

export function getChatDiagnosticsDirPath(): string {
  return getDiagnosticsDir()
}
