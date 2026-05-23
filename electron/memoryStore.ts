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

export type MemorySource = 'user' | 'model'

export type MemoryScope =
  | { type: 'global' }
  | { type: 'project'; projectId: string }

export interface Memory {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  source: MemorySource
  scope: MemoryScope
  /** Chat session that produced this memory (only set when `source === 'model'`). */
  sessionId?: string
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
  if (scope.type === 'project' && typeof scope.projectId === 'string' && scope.projectId.length > 0) {
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
  const memory: Memory = {
    id: raw.id,
    content: raw.content,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    source,
    scope,
  }
  if (typeof raw.sessionId === 'string' && raw.sessionId.length > 0) {
    memory.sessionId = raw.sessionId
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
    throw new Error(`Memory content exceeds maximum length of ${MAX_MEMORY_CONTENT_LENGTH} characters`)
  }
  return trimmed
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
 * Trim memories down to {@link MEMORY_CAP} by removing oldest entries first
 * (oldest by `updatedAt`). Returns the surviving memories sorted by `updatedAt`
 * descending so the newest entry sits at index 0.
 */
function applyCapAndSort(memories: Memory[]): Memory[] {
  const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt)
  if (sorted.length <= MEMORY_CAP) return sorted
  return sorted.slice(0, MEMORY_CAP)
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
async function withWriteLock<T>(operation: (currentIndex: MemoryIndex) => Promise<T> | T): Promise<T> {
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

  return withWriteLock(async (current) => {
    const now = Date.now()
    const memory: Memory = {
      id: randomUUID(),
      content,
      createdAt: now,
      updatedAt: now,
      source,
      scope,
      ...(sessionId ? { sessionId } : {}),
    }
    await persistIndex({
      memories: [memory, ...current.memories],
      version: INDEX_VERSION,
    })
    return memory
  })
}

/**
 * Updates an existing memory's content and/or scope. Returns the updated entry,
 * or null if the id wasn't found.
 */
export async function updateMemoryAsync(id: string, patch: UpdateMemoryPatch): Promise<Memory | null> {
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
 * Case-insensitive substring search across memory content. Returns up to
 * `limit` matches sorted by recency. v1 has no embeddings on purpose.
 */
export async function searchMemoriesAsync(
  query: string,
  limit = 10,
  scope?: MemoryScope
): Promise<Memory[]> {
  if (typeof query !== 'string' || !query.trim()) return []
  const needle = query.trim().toLowerCase()
  const memories = await getAllMemoriesAsync(scope)
  return memories
    .filter((memory) => memory.content.toLowerCase().includes(needle))
    .slice(0, limit)
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
