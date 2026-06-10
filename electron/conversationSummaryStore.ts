/**
 * Layer 2 of the memory system: rolling per-chat "conversation summaries".
 *
 * Mirrors ChatGPT's "Recent Conversations Summary" / reference-chat-history:
 * a small, pre-computed list of one-line summaries (what each recent chat was
 * about), injected as a compact "Recent activity" block at the top of new
 * conversations. This is NOT retrieval-augmented generation — just distilled
 * summaries kept under a tight cap and injected directly.
 *
 * Storage shape: a single `conversation-summaries.json` under
 * `app.getPath('userData')`. Follows the same conventions as `memoryStore`:
 * atomic whole-file writes, a short TTL read cache, and a serialized
 * read-modify-write lock so concurrent upserts cannot clobber each other.
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { writeFileAtomic } from './utils/atomicFile'

export interface ConversationSummary {
  sessionId: string
  summary: string
  updatedAt: number
}

export interface ConversationSummaryIndex {
  summaries: ConversationSummary[]
  version: number
}

const INDEX_VERSION = 1
/** Maximum number of conversation summaries retained (rolling window). */
export const SUMMARY_CAP = 15
/** Maximum length of a single summary in characters. */
export const MAX_SUMMARY_LENGTH = 300
const CACHE_TTL_MS = 1000

let cachedIndex: ConversationSummaryIndex | null = null
let cacheTimestamp = 0
let pendingWrite: Promise<unknown> = Promise.resolve()

function getIndexPath(): string {
  return path.join(app.getPath('userData'), 'conversation-summaries.json')
}

function createEmptyIndex(): ConversationSummaryIndex {
  return { summaries: [], version: INDEX_VERSION }
}

function normalizeSummary(input: unknown): ConversationSummary | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ConversationSummary>
  if (typeof raw.sessionId !== 'string' || !raw.sessionId) return null
  if (typeof raw.summary !== 'string' || !raw.summary.trim()) return null
  if (typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null
  return {
    sessionId: raw.sessionId,
    summary: raw.summary.trim().slice(0, MAX_SUMMARY_LENGTH),
    updatedAt: raw.updatedAt,
  }
}

function normalizeIndex(data: unknown): ConversationSummaryIndex {
  if (!data || typeof data !== 'object') return createEmptyIndex()
  const raw = data as Partial<ConversationSummaryIndex>
  const summaries = Array.isArray(raw.summaries)
    ? (raw.summaries.map(normalizeSummary).filter(Boolean) as ConversationSummary[])
    : []
  return { summaries, version: INDEX_VERSION }
}

/** Keep newest `SUMMARY_CAP` entries (by updatedAt), newest first. */
function applyCapAndSort(summaries: ConversationSummary[]): ConversationSummary[] {
  const sorted = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted.slice(0, SUMMARY_CAP)
}

async function readIndexAsync(): Promise<ConversationSummaryIndex> {
  if (cachedIndex && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedIndex
  }
  try {
    if (fsSync.existsSync(getIndexPath())) {
      const raw = await fs.readFile(getIndexPath(), 'utf-8')
      const parsed = normalizeIndex(JSON.parse(raw))
      cachedIndex = parsed
      cacheTimestamp = Date.now()
      return parsed
    }
  } catch (error) {
    console.error('Failed to read conversation summary index:', error)
  }
  const empty = createEmptyIndex()
  cachedIndex = empty
  cacheTimestamp = Date.now()
  return empty
}

async function withWriteLock<T>(
  operation: (currentIndex: ConversationSummaryIndex) => Promise<T> | T
): Promise<T> {
  const run = async (): Promise<T> => {
    cachedIndex = null
    cacheTimestamp = 0
    const current = await readIndexAsync()
    return operation(current)
  }
  const next = pendingWrite.then(run, run)
  pendingWrite = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

async function persistIndex(index: ConversationSummaryIndex): Promise<ConversationSummaryIndex> {
  const sorted = applyCapAndSort(index.summaries)
  const normalized: ConversationSummaryIndex = { summaries: sorted, version: INDEX_VERSION }
  await writeFileAtomic(getIndexPath(), JSON.stringify(normalized, null, 2))
  cachedIndex = normalized
  cacheTimestamp = Date.now()
  return normalized
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all summaries, newest first. */
export async function getAllSummariesAsync(): Promise<ConversationSummary[]> {
  const index = await readIndexAsync()
  return index.summaries
}

/**
 * Insert or replace the summary for a session. One summary per session: a
 * later upsert for the same `sessionId` overwrites the previous text and
 * refreshes `updatedAt` (so it stays in the rolling window).
 */
export async function upsertSummaryAsync(
  sessionId: string,
  summary: string
): Promise<ConversationSummary> {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Conversation summary requires a sessionId')
  }
  const trimmed = typeof summary === 'string' ? summary.trim() : ''
  if (!trimmed) {
    throw new Error('Conversation summary cannot be empty')
  }
  const entry: ConversationSummary = {
    sessionId,
    summary: trimmed.slice(0, MAX_SUMMARY_LENGTH),
    updatedAt: Date.now(),
  }
  return withWriteLock(async (current) => {
    const others = current.summaries.filter((item) => item.sessionId !== sessionId)
    await persistIndex({ summaries: [entry, ...others], version: INDEX_VERSION })
    return entry
  })
}

/** Removes the summary for a session. Returns true if one was removed. */
export async function deleteSummaryAsync(sessionId: string): Promise<boolean> {
  if (typeof sessionId !== 'string' || !sessionId) return false
  return withWriteLock(async (current) => {
    const next = current.summaries.filter((item) => item.sessionId !== sessionId)
    if (next.length === current.summaries.length) return false
    await persistIndex({ summaries: next, version: INDEX_VERSION })
    return true
  })
}

/** Removes all summaries. */
export async function clearAllSummariesAsync(): Promise<void> {
  await withWriteLock(async () => {
    await persistIndex(createEmptyIndex())
  })
}

/** Test-only hook to reset the in-memory cache between test cases. */
export function _resetConversationSummaryCache(): void {
  cachedIndex = null
  cacheTimestamp = 0
  pendingWrite = Promise.resolve()
}
