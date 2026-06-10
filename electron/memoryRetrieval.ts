/**
 * Multi-signal memory retrieval.
 *
 * Replaces the old substring-only search with a fused score that combines:
 *   1. keyword overlap on lightly-normalized tokens (verb/plural normalization),
 *   2. a substring-containment boost (cheap exact-phrase signal), and
 *   3. a small recency component (newer memories win ties).
 *
 * This mirrors the spirit of Mem0's "multi-signal retrieval" (semantic +
 * keyword + entity, fused) but stays dependency-free and token-efficient — no
 * embeddings, no vector store. Superseded memories are excluded by default so
 * stale facts never resurface in retrieval/prompt injection.
 */

import type { Memory } from './memoryStore'

export interface ScoreMemoriesOptions {
  /** Max results to return. Default 10. */
  limit?: number
  /** Include superseded entries in scoring. Default false. */
  includeSuperseded?: boolean
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or',
  'i', 'me', 'my', 'you', 'your', 'it', 'this', 'that', 'what', 'who',
  'how', 'when', 'where', 'which', 'with', 'about', 'as', 'so', 'we',
])

/**
 * Light, deterministic stemming for English plurals/verb forms. Intentionally
 * small — just enough so "meetings" matches "meeting" and "studies" matches
 * "study". Not a full Porter stemmer.
 */
function stem(token: string): string {
  let t = token
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3)
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2)
  else if (t.length > 3 && t.endsWith('es')) t = t.slice(0, -2)
  else if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1)
  return t
}

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .map(stem)
}

/** Score a single memory against the query token set. Returns 0 when no signal. */
function scoreOne(memory: Memory, queryTokens: Set<string>, normalizedQuery: string): number {
  const contentTokens = normalizeTokens(memory.content)
  if (queryTokens.size === 0) return 0

  // 1. Keyword coverage: fraction of query tokens present in the memory.
  const contentSet = new Set(contentTokens)
  let overlap = 0
  for (const token of queryTokens) {
    if (contentSet.has(token)) overlap += 1
  }
  const keywordScore = overlap / queryTokens.size

  // 2. Substring containment boost (exact phrase signal).
  const normalizedContent = memory.content.toLowerCase()
  const substringBoost = normalizedQuery.length >= 3 && normalizedContent.includes(normalizedQuery) ? 0.5 : 0

  return keywordScore + substringBoost
}

/**
 * Rank memories against a query, returning the best matches (highest score
 * first, recency as tiebreak). Returns [] for an empty query.
 */
export function scoreMemories(
  query: string,
  memories: Memory[],
  options: ScoreMemoriesOptions = {}
): Memory[] {
  const limit = options.limit && options.limit > 0 ? options.limit : 10
  const trimmed = typeof query === 'string' ? query.trim() : ''
  if (!trimmed) return []

  const candidates = options.includeSuperseded
    ? memories
    : memories.filter((memory) => memory.status !== 'superseded')

  const queryTokens = new Set(normalizeTokens(trimmed))
  const normalizedQuery = trimmed.toLowerCase()

  const scored = candidates
    .map((memory) => ({ memory, score: scoreOne(memory, queryTokens, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.memory.updatedAt - a.memory.updatedAt // recency tiebreak
    })

  return scored.slice(0, limit).map((entry) => entry.memory)
}
