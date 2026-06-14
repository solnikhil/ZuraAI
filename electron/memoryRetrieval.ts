/**
 * Multi-signal memory retrieval.
 *
 * Replaces the old substring-only search with a fused score that combines:
 *   1. keyword overlap on lightly-normalized + aliased tokens,
 *   2. a substring-containment boost (cheap exact-phrase signal),
 *   3. proximity between matched terms inside the memory,
 *   4. a recency component, and
 *   5. a small human-authored memory boost.
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
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'and',
  'or',
  'i',
  'me',
  'my',
  'you',
  'your',
  'it',
  'this',
  'that',
  'what',
  'who',
  'how',
  'when',
  'where',
  'which',
  'with',
  'about',
  'as',
  'so',
  'we',
])

const QUERY_ALIASES: Record<string, readonly string[]> = {
  address: ['live', 'location', 'city'],
  based: ['live', 'location'],
  call: ['name'],
  city: ['live', 'location'],
  college: ['school', 'university', 'study'],
  enjoy: ['like', 'prefer', 'favorite'],
  favourite: ['favorite', 'prefer', 'like'],
  job: ['work', 'company', 'role'],
  located: ['live', 'location'],
  location: ['live', 'city', 'address'],
  prefer: ['like', 'favorite'],
  reside: ['live', 'location'],
  school: ['college', 'university', 'study'],
  university: ['college', 'school', 'study'],
  work: ['job', 'company', 'role'],
}

const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_PROXIMITY_WINDOW = 8

/**
 * Light, deterministic stemming for English plurals/verb forms. Intentionally
 * small — just enough so "meetings" matches "meeting" and "studies" matches
 * "study". Not a full Porter stemmer.
 */
function stem(token: string): string {
  let t = token
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`
  if (t.length > 4 && t.endsWith('ves')) return `${t.slice(0, -1)}`
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

function expandQueryTokens(tokens: string[]): Set<string> {
  const expanded = new Set(tokens)
  for (const token of tokens) {
    for (const alias of QUERY_ALIASES[token] ?? []) {
      expanded.add(stem(alias))
    }
  }
  return expanded
}

function recencyScore(updatedAt: number, now: number): number {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 0
  const age = Math.max(0, now - updatedAt)
  return 1 / (1 + age / RECENCY_HALF_LIFE_MS)
}

function proximityScore(contentTokens: string[], queryTokens: Set<string>): number {
  const matchedPositions: number[] = []
  contentTokens.forEach((token, index) => {
    if (queryTokens.has(token)) matchedPositions.push(index)
  })
  if (matchedPositions.length < 2) return 0
  const window = matchedPositions[matchedPositions.length - 1] - matchedPositions[0] + 1
  if (window <= 1) return 1
  return Math.max(0, 1 - (window - 1) / MAX_PROXIMITY_WINDOW)
}

/** Score a single memory against the query token set. Returns 0 when no lexical signal. */
function scoreOne(
  memory: Memory,
  queryTokens: Set<string>,
  normalizedQuery: string,
  now: number
): number {
  const contentTokens = normalizeTokens(memory.content)
  if (queryTokens.size === 0) return 0

  const contentSet = new Set(contentTokens)
  let overlap = 0
  for (const token of queryTokens) {
    if (contentSet.has(token)) overlap += 1
  }
  const keywordScore = overlap / queryTokens.size
  if (overlap === 0) return 0

  const contentCoverage = contentTokens.length > 0 ? overlap / contentSet.size : 0

  const normalizedContent = memory.content.toLowerCase()
  const phraseScore =
    normalizedQuery.length >= 3 && normalizedContent.includes(normalizedQuery) ? 1 : 0
  const proximity = proximityScore(contentTokens, queryTokens)
  const recency = recencyScore(memory.updatedAt, now)
  const humanAuthored = memory.source === 'user' ? 1 : 0

  return (
    keywordScore * 0.48 +
    contentCoverage * 0.14 +
    phraseScore * 0.18 +
    proximity * 0.08 +
    recency * 0.09 +
    humanAuthored * 0.03
  )
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

  const queryTokens = expandQueryTokens(normalizeTokens(trimmed))
  const normalizedQuery = trimmed.toLowerCase()
  const now = Date.now()

  const scored = candidates
    .map((memory) => ({ memory, score: scoreOne(memory, queryTokens, normalizedQuery, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.memory.updatedAt - a.memory.updatedAt // recency tiebreak
    })

  return scored.slice(0, limit).map((entry) => entry.memory)
}
