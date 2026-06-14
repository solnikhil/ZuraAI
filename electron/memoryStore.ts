/**
 * Main-process persistence for ChatGPT-style "saved memories".
 *
 * Memories are short, user-visible facts that the model and the user can both
 * manage. They are injected into the system prompt of every conversation so
 * the assistant can personalize replies across chats.
 *
 * Storage shape: a single `memory-index.json` file under `app.getPath('userData')`.
 * Memories are small enough that we don't need per-id files; whole-file atomic
 * writes via `writeFileAtomic` are sufficient.
 *
 * Forward-compat note: every Memory carries a `scope` field. v1 only writes
 * `{ type: 'global' }` entries, but the schema and the scope-filter helper
 * already support `{ type: 'project', projectId }` so the projects/folders
 * feature can layer per-project memories on top without a data migration.
 * To extend: thread the active `projectId` through `getAllMemories(scope)` and
 * the IPC layer; no field changes required.
 */

import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { writeFileAtomic } from './utils/atomicFile'
import { scoreMemories } from './memoryRetrieval'

export type MemorySource = 'user' | 'model'

/**
 * Origin distinguishes HOW a model-sourced memory was created:
 * - `tool`: saved via the in-conversation `save_memory` tool call.
 * - `background`: extracted by the background "dreaming" pipeline after a chat turn.
 */
export type MemoryOrigin = 'tool' | 'background'

export type MemoryScope = { type: 'global' } | { type: 'project'; projectId: string }

/**
 * Lifecycle status of a memory under the ADD-only model.
 * - `active`: current, retrieval-eligible.
 * - `superseded`: replaced by a newer fact but retained (not deleted) so the
 *   system can reason about how a fact evolved (Mem0 v3 ADD-only approach).
 */
export type MemoryStatus = 'active' | 'superseded'

export interface Memory {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  source: MemorySource
  scope: MemoryScope
  /** Lifecycle status; defaults to `active`. */
  status: MemoryStatus
  /** Id of an older memory this entry replaces (set on the newer entry). */
  supersedes?: string
  /** Id of a newer memory that replaced this one (set on the older entry). */
  supersededBy?: string
  /** Chat session that produced this memory (only set when `source === 'model'`). */
  sessionId?: string
  /** How the memory was created when source is 'model'. */
  origin?: MemoryOrigin
}

export interface MemoryIndex {
  memories: Memory[]
  version: number
}

export interface AddMemoryInput {
  content: string
  source?: MemorySource
  scope?: MemoryScope
  sessionId?: string
  origin?: MemoryOrigin
}

/** Options for {@link addMemoryWithDedupeAsync}. */
export interface DedupeAddOptions {
  /**
   * Id of an existing memory this new fact replaces. When provided (and the
   * target exists), the store links new→old and marks the old entry
   * `superseded` instead of deleting it (ADD-only). Typically supplied by the
   * extraction pipeline, which decides semantic contradictions with an LLM.
   */
  supersedesId?: string
}

/** Outcome of {@link addMemoryWithDedupeAsync}. */
export interface DedupeAddResult {
  /** The resulting memory (the new entry, or the existing one on a NOOP). */
  memory: Memory
  /**
   * - `added`: a new memory was written.
   * - `noop`: an active near-duplicate already existed; nothing was written.
   * - `superseded`: a new memory was written and linked to a superseded entry.
   */
  operation: 'added' | 'noop' | 'superseded'
}

export interface UpdateMemoryPatch {
  content?: string
  scope?: MemoryScope
}

const INDEX_VERSION = 1
/** Maximum number of memories retained on disk before FIFO eviction. */
export const MEMORY_CAP = 200
/** Maximum length of a single memory entry in characters. */
export const MAX_MEMORY_CONTENT_LENGTH = 1000
/** Superseded memories are retained briefly for audit/history, then compacted. */
export const SUPERSEDED_MEMORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const CACHE_TTL_MS = 1000

let cachedIndex: MemoryIndex | null = null
let cacheTimestamp = 0
let pendingWrite: Promise<unknown> = Promise.resolve()

function getUserDataPath(): string {
  return app.getPath('userData')
}

function getIndexPath(): string {
  return path.join(getUserDataPath(), 'memory-index.json')
}

function createEmptyIndex(): MemoryIndex {
  return { memories: [], version: INDEX_VERSION }
}

function isMemoryScope(value: unknown): value is MemoryScope {
  if (!value || typeof value !== 'object') return false
  const scope = value as { type?: unknown; projectId?: unknown }
  if (scope.type === 'global') return true
  if (
    scope.type === 'project' &&
    typeof scope.projectId === 'string' &&
    scope.projectId.length > 0
  ) {
    return true
  }
  return false
}

function normalizeMemory(input: unknown): Memory | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<Memory>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.content !== 'string') return null
  if (typeof raw.createdAt !== 'number' || typeof raw.updatedAt !== 'number') return null
  const source: MemorySource = raw.source === 'model' ? 'model' : 'user'
  const scope: MemoryScope = isMemoryScope(raw.scope) ? raw.scope : { type: 'global' }
  const status: MemoryStatus = raw.status === 'superseded' ? 'superseded' : 'active'
  const memory: Memory = {
    id: raw.id,
    content: raw.content,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    source,
    scope,
    status,
  }
  if (typeof raw.supersedes === 'string' && raw.supersedes.length > 0) {
    memory.supersedes = raw.supersedes
  }
  if (typeof raw.supersededBy === 'string' && raw.supersededBy.length > 0) {
    memory.supersededBy = raw.supersededBy
  }
  if (typeof raw.sessionId === 'string' && raw.sessionId.length > 0) {
    memory.sessionId = raw.sessionId
  }
  if (raw.origin === 'tool' || raw.origin === 'background') {
    memory.origin = raw.origin
  }
  return memory
}

function normalizeIndex(data: unknown): MemoryIndex {
  if (!data || typeof data !== 'object') return createEmptyIndex()
  const raw = data as Partial<MemoryIndex>
  const memories = Array.isArray(raw.memories)
    ? (raw.memories.map(normalizeMemory).filter(Boolean) as Memory[])
    : []
  return { memories, version: INDEX_VERSION }
}

/**
 * Validates and normalizes memory content.
 * @throws Error if content is empty or exceeds {@link MAX_MEMORY_CONTENT_LENGTH}.
 */
function validateContent(content: unknown): string {
  if (typeof content !== 'string') {
    throw new Error('Memory content must be a string')
  }
  const trimmed = content.trim()
  if (!trimmed) {
    throw new Error('Memory content cannot be empty')
  }
  if (trimmed.length > MAX_MEMORY_CONTENT_LENGTH) {
    throw new Error(
      `Memory content exceeds maximum length of ${MAX_MEMORY_CONTENT_LENGTH} characters`
    )
  }
  return trimmed
}

function scopeKey(scope: MemoryScope): string {
  return scope.type === 'global' ? 'global' : `project:${scope.projectId}`
}

function normalizeForCleanup(content: string): string {
  return content
    .toLowerCase()
    .replace(/[\s]+/g, ' ')
    .replace(/^[\s.,!?;:'"-]+|[\s.,!?;:'"-]+$/g, '')
    .trim()
}

/**
 * Automatic memory cleanup keeps the ADD-only store bounded without surfacing
 * stale facts in retrieval:
 * - exact duplicate content in the same scope is coalesced, newest active wins;
 * - superseded memories are retained for a fixed audit window, then pruned;
 * - lifecycle links pointing at pruned/evicted rows are removed.
 */
function cleanupMemories(memories: Memory[], now = Date.now()): Memory[] {
  const seenExact = new Set<string>()
  const sortedForCleanup = [...memories].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return b.updatedAt - a.updatedAt
  })

  const kept: Memory[] = []
  for (const memory of sortedForCleanup) {
    if (
      memory.status === 'superseded' &&
      Number.isFinite(memory.updatedAt) &&
      now - memory.updatedAt > SUPERSEDED_MEMORY_RETENTION_MS
    ) {
      continue
    }

    const exactKey = `${scopeKey(memory.scope)}:${normalizeForCleanup(memory.content)}`
    if (seenExact.has(exactKey)) continue
    seenExact.add(exactKey)
    kept.push(memory)
  }

  const keptIds = new Set(kept.map((memory) => memory.id))
  return kept.map((memory) => {
    const repaired: Memory = { ...memory }
    if (repaired.supersedes && !keptIds.has(repaired.supersedes)) {
      delete repaired.supersedes
    }
    if (repaired.supersededBy && !keptIds.has(repaired.supersededBy)) {
      delete repaired.supersededBy
    }
    return repaired
  })
}

/**
 * Filters memories by scope. v1 callers pass `{ type: 'global' }`. When
 * projects ship, callers pass `{ type: 'project', projectId }` and we return
 * project-scoped memories plus any global ones (mirroring how ChatGPT global
 * memories surface inside a project).
 */
export function filterMemoriesByScope(memories: Memory[], scope: MemoryScope): Memory[] {
  if (scope.type === 'global') {
    return memories.filter((memory) => memory.scope.type === 'global')
  }
  return memories.filter(
    (memory) =>
      memory.scope.type === 'global' ||
      (memory.scope.type === 'project' && memory.scope.projectId === scope.projectId)
  )
}

/**
 * Trim memories down to {@link MEMORY_CAP} and return them in display order.
 *
 * Eviction is true FIFO by **`createdAt`** (oldest *created* dropped first).
 * This deliberately differs from `updatedAt`: editing an old memory bumps its
 * `updatedAt`, and evicting by `updatedAt` would let a stale-but-recently-
 * edited entry survive while genuinely newer memories were dropped. Eviction
 * by `createdAt` keeps the cap honest.
 *
 * Survivors are returned sorted by `updatedAt` descending so the most recently
 * touched entry sits at index 0 (preserves the existing newest-first display
 * contract for the Settings list and prompt fallback ordering).
 */
function applyCapAndSort(memories: Memory[]): Memory[] {
  const cleaned = cleanupMemories(memories)
  let survivors = cleaned
  if (cleaned.length > MEMORY_CAP) {
    survivors = [...cleaned].sort((a, b) => b.createdAt - a.createdAt).slice(0, MEMORY_CAP)
    survivors = cleanupMemories(survivors)
  }
  return [...survivors].sort((a, b) => b.updatedAt - a.updatedAt)
}

async function readIndexAsync(): Promise<MemoryIndex> {
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
    console.error('Failed to read memory index:', error)
  }
  const empty = createEmptyIndex()
  cachedIndex = empty
  cacheTimestamp = Date.now()
  return empty
}

function readIndexSync(): MemoryIndex {
  if (cachedIndex && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedIndex
  }
  try {
    if (fsSync.existsSync(getIndexPath())) {
      const raw = fsSync.readFileSync(getIndexPath(), 'utf-8')
      const parsed = normalizeIndex(JSON.parse(raw))
      cachedIndex = parsed
      cacheTimestamp = Date.now()
      return parsed
    }
  } catch (error) {
    console.error('Failed to read memory index:', error)
  }
  const empty = createEmptyIndex()
  cachedIndex = empty
  cacheTimestamp = Date.now()
  return empty
}

/**
 * Serializes read-modify-write operations so that concurrent callers (e.g.,
 * the model invoking `save_memory` in parallel with the user editing the
 * settings panel) cannot clobber each other. Each mutation re-reads the
 * latest persisted index inside the lock before computing its update.
 */
async function withWriteLock<T>(
  operation: (currentIndex: MemoryIndex) => Promise<T> | T
): Promise<T> {
  const run = async (): Promise<T> => {
    // Bypass the TTL cache for the authoritative read inside the lock.
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all memories. Optionally filter by scope (v1 callers pass `{ type: 'global' }`). */
export async function getAllMemoriesAsync(scope?: MemoryScope): Promise<Memory[]> {
  const index = await readIndexAsync()
  return scope ? filterMemoriesByScope(index.memories, scope) : index.memories
}

/** Sync variant of {@link getAllMemoriesAsync}. */
export function getAllMemories(scope?: MemoryScope): Memory[] {
  const index = readIndexSync()
  return scope ? filterMemoriesByScope(index.memories, scope) : index.memories
}

export async function getMemoryAsync(id: string): Promise<Memory | null> {
  if (typeof id !== 'string' || !id) return null
  const index = await readIndexAsync()
  return index.memories.find((memory) => memory.id === id) ?? null
}

/** Serialized write helper used inside {@link withWriteLock}. */
async function persistIndex(index: MemoryIndex): Promise<MemoryIndex> {
  const sorted = applyCapAndSort(index.memories)
  const normalized: MemoryIndex = { memories: sorted, version: INDEX_VERSION }
  await writeFileAtomic(getIndexPath(), JSON.stringify(normalized, null, 2))
  cachedIndex = normalized
  cacheTimestamp = Date.now()
  return normalized
}

/** Adds a new memory. Returns the persisted entry (with generated id and timestamps). */
export async function addMemoryAsync(input: AddMemoryInput): Promise<Memory> {
  const content = validateContent(input.content)
  const scope: MemoryScope =
    input.scope && isMemoryScope(input.scope) ? input.scope : { type: 'global' }
  const source: MemorySource = input.source ?? 'user'
  const sessionId =
    typeof input.sessionId === 'string' && input.sessionId.length > 0 ? input.sessionId : undefined
  const origin: MemoryOrigin | undefined = input.origin ?? undefined

  return withWriteLock(async (current) => {
    const now = Date.now()
    const memory: Memory = {
      id: randomUUID(),
      content,
      createdAt: now,
      updatedAt: now,
      source,
      scope,
      status: 'active',
      ...(sessionId ? { sessionId } : {}),
      ...(origin ? { origin } : {}),
    }
    await persistIndex({
      memories: [memory, ...current.memories],
      version: INDEX_VERSION,
    })
    return memory
  })
}

// ---------------------------------------------------------------------------
// ADD-only dedupe + contradiction handling (Mem0 v3 style)
// ---------------------------------------------------------------------------

/** Normalize content for similarity comparison (lowercase, collapse ws, strip edge punctuation). */
function normalizeForCompare(content: string): string {
  return content
    .toLowerCase()
    .replace(/[\s]+/g, ' ')
    .replace(/^[\s.,!?;:'"-]+|[\s.,!?;:'"-]+$/g, '')
    .trim()
}

function tokenize(content: string): Set<string> {
  return new Set(
    normalizeForCompare(content)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0)
  )
}

/** Jaccard similarity over word tokens, in [0, 1]. */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (tokensA.size === 0 && tokensB.size === 0) return 1
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1
  }
  const union = tokensA.size + tokensB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Two memories are near-duplicates when their normalized content is identical,
 * one fully contains the other, or their token Jaccard similarity is high.
 * Intentionally conservative — semantic contradiction detection (NY vs SF) is
 * the extraction pipeline's job (it passes an explicit `supersedesId`).
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const normA = normalizeForCompare(a)
  const normB = normalizeForCompare(b)
  if (!normA || !normB) return false
  if (normA === normB) return true
  if (normA.includes(normB) || normB.includes(normA)) return true
  return jaccardSimilarity(a, b) >= 0.9
}

/**
 * ADD-only write with dedupe and optional supersession.
 *
 * - When `supersedesId` targets an existing memory: writes the new entry with
 *   `supersedes` set, marks the old entry `superseded` + `supersededBy`, and
 *   keeps both (no destructive overwrite). Returns `operation: 'superseded'`.
 * - Otherwise, if an **active** near-duplicate already exists in the same
 *   scope: writes nothing and returns that entry with `operation: 'noop'`.
 * - Otherwise: writes a new entry and returns `operation: 'added'`.
 */
export async function addMemoryWithDedupeAsync(
  input: AddMemoryInput,
  options: DedupeAddOptions = {}
): Promise<DedupeAddResult> {
  const content = validateContent(input.content)
  const scope: MemoryScope =
    input.scope && isMemoryScope(input.scope) ? input.scope : { type: 'global' }
  const source: MemorySource = input.source ?? 'user'
  const sessionId =
    typeof input.sessionId === 'string' && input.sessionId.length > 0 ? input.sessionId : undefined
  const origin: MemoryOrigin | undefined = input.origin ?? undefined
  const supersedesId =
    typeof options.supersedesId === 'string' && options.supersedesId.length > 0
      ? options.supersedesId
      : undefined

  return withWriteLock(async (current) => {
    const now = Date.now()

    if (supersedesId) {
      const target = current.memories.find((memory) => memory.id === supersedesId)
      if (target) {
        const newMemory: Memory = {
          id: randomUUID(),
          content,
          createdAt: now,
          updatedAt: now,
          source,
          scope,
          status: 'active',
          supersedes: target.id,
          ...(sessionId ? { sessionId } : {}),
          ...(origin ? { origin } : {}),
        }
        const nextMemories = current.memories.map((memory) =>
          memory.id === target.id
            ? {
                ...memory,
                status: 'superseded' as const,
                supersededBy: newMemory.id,
                updatedAt: now,
              }
            : memory
        )
        await persistIndex({ memories: [newMemory, ...nextMemories], version: INDEX_VERSION })
        return { memory: newMemory, operation: 'superseded' as const }
      }
      // Target vanished — fall through to a normal deduped add.
    }

    const duplicate = current.memories.find(
      (memory) => memory.status === 'active' && isNearDuplicate(memory.content, content)
    )
    if (duplicate) {
      return { memory: duplicate, operation: 'noop' as const }
    }

    const newMemory: Memory = {
      id: randomUUID(),
      content,
      createdAt: now,
      updatedAt: now,
      source,
      scope,
      status: 'active',
      ...(sessionId ? { sessionId } : {}),
      ...(origin ? { origin } : {}),
    }
    await persistIndex({ memories: [newMemory, ...current.memories], version: INDEX_VERSION })
    return { memory: newMemory, operation: 'added' as const }
  })
}

/** Returns only active (non-superseded) memories. */
export function excludeSuperseded(memories: Memory[]): Memory[] {
  return memories.filter((memory) => memory.status !== 'superseded')
}

/**
 * Updates an existing memory's content and/or scope. Returns the updated entry,
 * or null if the id wasn't found.
 */
export async function updateMemoryAsync(
  id: string,
  patch: UpdateMemoryPatch
): Promise<Memory | null> {
  if (typeof id !== 'string' || !id) return null

  // Validate patch contents up-front so we throw before acquiring the lock.
  const validatedContent = patch.content !== undefined ? validateContent(patch.content) : undefined
  if (patch.scope !== undefined && !isMemoryScope(patch.scope)) {
    throw new Error('Invalid memory scope')
  }

  return withWriteLock(async (current) => {
    const existing = current.memories.find((memory) => memory.id === id)
    if (!existing) return null
    const updated: Memory = {
      ...existing,
      ...(validatedContent !== undefined ? { content: validatedContent } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      updatedAt: Date.now(),
    }
    const nextMemories = current.memories.map((memory) => (memory.id === id ? updated : memory))
    await persistIndex({ memories: nextMemories, version: INDEX_VERSION })
    return updated
  })
}

/** Deletes a memory by id. Returns true if a memory was removed. */
export async function deleteMemoryAsync(id: string): Promise<boolean> {
  if (typeof id !== 'string' || !id) return false
  return withWriteLock(async (current) => {
    const nextMemories = current.memories.filter((memory) => memory.id !== id)
    if (nextMemories.length === current.memories.length) return false
    await persistIndex({ memories: nextMemories, version: INDEX_VERSION })
    return true
  })
}

/** Removes all memories. */
export async function clearAllMemoriesAsync(): Promise<void> {
  await withWriteLock(async () => {
    await persistIndex(createEmptyIndex())
  })
}

/**
 * Multi-signal memory search (keyword overlap + substring + recency fusion).
 * Excludes superseded entries. v1 has no embeddings on purpose; see
 * {@link scoreMemories} in `memoryRetrieval.ts`.
 */
export async function searchMemoriesAsync(
  query: string,
  limit = 10,
  scope?: MemoryScope
): Promise<Memory[]> {
  if (typeof query !== 'string' || !query.trim()) return []
  const memories = await getAllMemoriesAsync(scope)
  return scoreMemories(query, memories, { limit })
}

export function getMemoryStoreFilePath(): string {
  return getIndexPath()
}

/** Test-only hook to reset the in-memory cache between test cases. */
export function _resetMemoryStoreCache(): void {
  cachedIndex = null
  cacheTimestamp = 0
  pendingWrite = Promise.resolve()
}
