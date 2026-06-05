/**
 * Renderer-side built-in tools that let the model manage user memories.
 *
 * Unlike `web_search` / `code_execution` (main-process IPC), these tools
 * operate purely on the renderer's `window.memory` bridge. They:
 *   1. Persist immediately via the bridge (which writes to the main-process
 *      memory store and broadcasts memory-store:changed for live UI sync).
 *   2. Return a structured `ToolResult.data` payload shaped as a
 *      MemoryToolEvent so the inline MemoryUpdatePill (Task 7) can group and
 *      render diffs without re-fetching from the store.
 *   3. Are gated by the Memory skill (`skills.memory.enabled`) —
 *      see `src/hooks/useToolCalling.ts`.
 */

import type { Memory } from '@/electron/types'
import { toast } from 'sonner'
import type { ToolDescriptor, ToolInputSchema, ToolResult } from './types'

export const MEMORY_TOOL_NAMES = ['save_memory', 'update_memory', 'delete_memory', 'search_memories'] as const
export type MemoryToolName = (typeof MEMORY_TOOL_NAMES)[number]

export function isMemoryToolName(name: string): name is MemoryToolName {
  return (MEMORY_TOOL_NAMES as readonly string[]).includes(name)
}

/**
 * Defensive parameter-name normalization for memory tool calls.
 *
 * Tool-calling models (Qwen, Llama variants, etc.) sometimes invent close-but-
 * wrong parameter names (`text`, `fact`, `memory`, `value` instead of
 * `content`; `q` instead of `query`). When that happens our schema-driven
 * validator rejects the call with "Missing required parameter(s): content"
 * even though the model's intent was perfectly valid. To stay forgiving
 * without breaking the schema we coerce common aliases to the canonical key
 * BEFORE validation runs. Only memory tools are normalized; other tools keep
 * their strict schemas.
 *
 * Returns a new ToolCall with rewritten arguments. Does not throw.
 */
export function normalizeMemoryToolCall<T extends { name: string; arguments: Record<string, unknown> }>(
  toolCall: T
): T {
  if (!isMemoryToolName(toolCall.name)) return toolCall

  // Per-tool list of canonical keys that the schema actually expects. We only
  // try to fill in canonicals from this list — that prevents `text` from being
  // mapped to `content` when the model is calling `search_memories` (where
  // `text` should resolve to `query`).
  const canonicalKeysByTool: Record<MemoryToolName, readonly string[]> = {
    save_memory: ['content'],
    update_memory: ['id', 'content'],
    delete_memory: ['id'],
    search_memories: ['query'],
  }

  const aliasesByCanonical: Record<string, readonly string[]> = {
    content: ['text', 'fact', 'memory', 'value', 'note', 'body', 'message'],
    id: ['memory_id', 'memoryId', 'memoryID', 'mid'],
    query: ['q', 'search', 'term', 'text'],
  }

  const isPresent = (value: unknown): boolean =>
    value !== undefined && value !== null && value !== ''

  const args: Record<string, unknown> = { ...toolCall.arguments }
  const expected = canonicalKeysByTool[toolCall.name as MemoryToolName]

  for (const canonical of expected) {
    if (isPresent(args[canonical])) continue
    const aliases = aliasesByCanonical[canonical] ?? []
    for (const alias of aliases) {
      if (isPresent(args[alias])) {
        args[canonical] = args[alias]
        break
      }
    }
  }
  return { ...toolCall, arguments: args }
}

/**
 * Structured event placed on `ToolResult.data` for memory tool calls. The
 * inline pill consumes this shape; the assistant message persists it inside
 * the existing `toolResults` array — no extra storage required.
 */
export type MemoryToolEvent =
  | { kind: 'memory.added'; id: string; content: string; updatedAt: number }
  | {
      kind: 'memory.updated'
      id: string
      content: string
      previousContent: string
      updatedAt: number
    }
  | { kind: 'memory.deleted'; id: string; previousContent: string }
  | { kind: 'memory.searched'; query: string; matches: Array<Pick<Memory, 'id' | 'content' | 'updatedAt'>> }

const SAVE_PARAMS: ToolInputSchema = {
  type: 'object',
  description: 'Arguments for save_memory.',
  properties: {
    content: {
      type: 'string',
      description:
        'REQUIRED. The fact to remember about the user. Pass the fact as the `content` parameter (not `text`, `fact`, or `memory`). Keep it short — one sentence. Examples: "User prefers dark mode", "User is building an Electron app called ZuraAI", "User\'s preferred name is Nikhil".',
    },
  },
  required: ['content'],
}

const UPDATE_PARAMS: ToolInputSchema = {
  type: 'object',
  description: 'Arguments for update_memory.',
  properties: {
    id: {
      type: 'string',
      description:
        'REQUIRED. The id of an existing memory. Pass it as the `id` parameter (not `memory_id`). Get this from search_memories or from the saved-memories list embedded in the system prompt.',
    },
    content: {
      type: 'string',
      description:
        'REQUIRED. The new content for that memory. Pass it as the `content` parameter (not `text`). Replaces the previous text entirely.',
    },
  },
  required: ['id', 'content'],
}

const DELETE_PARAMS: ToolInputSchema = {
  type: 'object',
  description: 'Arguments for delete_memory.',
  properties: {
    id: {
      type: 'string',
      description: 'REQUIRED. The id of the memory to delete. Pass it as the `id` parameter.',
    },
  },
  required: ['id'],
}

const SEARCH_PARAMS: ToolInputSchema = {
  type: 'object',
  description: 'Arguments for search_memories.',
  properties: {
    query: {
      type: 'string',
      description:
        'REQUIRED. Substring to match against memory content (case-insensitive). Pass it as the `query` parameter (not `text` or `q`).',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of matches to return (default 5, max 20).',
      default: 5,
    },
  },
  required: ['query'],
}

export const memoryToolDefinitions: ToolDescriptor[] = [
  {
    name: 'save_memory',
    description:
      'Save a new long-term memory about the user. Use when the user shares a durable fact, preference, goal, or context worth remembering across chats. Avoid saving ephemeral details (current task, one-off questions) and never save secrets or credentials.',
    parameters: SAVE_PARAMS,
    category: 'system',
    origin: 'builtin-renderer',
  },
  {
    name: 'update_memory',
    description:
      'Update an existing memory by id. Use when the user corrects or refines something previously stored.',
    parameters: UPDATE_PARAMS,
    category: 'system',
    origin: 'builtin-renderer',
  },
  {
    name: 'delete_memory',
    description: 'Delete an existing memory by id. Use when the user asks to forget something.',
    parameters: DELETE_PARAMS,
    category: 'system',
    origin: 'builtin-renderer',
  },
  {
    name: 'search_memories',
    description:
      'Search saved memories with a substring query. Returns up to `limit` matches with their ids and content. Useful when memories are large and you only need related entries.',
    parameters: SEARCH_PARAMS,
    category: 'system',
    origin: 'builtin-renderer',
  },
]

interface ExecuteMemoryToolOptions {
  /** Active chat session id, attached to model-saved memories for traceability. */
  sessionId?: string
  /**
   * Active memory scope. v1 always passes global; threaded through so the
   * projects/folders feature can scope model-driven memory ops without another
   * code change. Defaults to `{ type: 'global' }`.
   */
  scope?: import('@/electron/types').MemoryScope
}

/**
 * Executes a memory tool by name through the renderer-only `window.memory`
 * bridge. Returns a `ToolResult` whose `data` is a {@link MemoryToolEvent}.
 */
export async function executeMemoryTool(
  toolName: MemoryToolName,
  args: Record<string, unknown>,
  options: ExecuteMemoryToolOptions = {}
): Promise<ToolResult> {
  const start = performance.now()
  const fail = (error: string): ToolResult => ({
    success: false,
    error,
    executionTime: Math.round(performance.now() - start),
    metadata: { origin: 'builtin-renderer' },
  })
  const ok = (data: MemoryToolEvent): ToolResult => ({
    success: true,
    data,
    executionTime: Math.round(performance.now() - start),
    metadata: { origin: 'builtin-renderer' },
  })

  if (typeof window === 'undefined' || !window.memory) {
    return fail('Memory bridge unavailable — memory tools require Electron.')
  }

  const scope = options.scope ?? { type: 'global' }

  const notifyChange = (message: string) => {
    try {
      toast.success(message, { duration: 3500 })
    } catch {
      // Toaster may be unmounted in tests — ignore.
    }
  }

  try {
    if (toolName === 'save_memory') {
      const content = typeof args.content === 'string' ? args.content : ''
      if (!content.trim()) return fail('save_memory requires a non-empty `content`.')
      // Synchronous write: await the persisted entry so the returned event
      // carries the REAL store-assigned UUID (not a synthetic optimistic id).
      // This makes chained tool calls reliable — e.g. the model can call
      // save_memory and then update_memory/delete_memory with the returned id
      // in the same turn, and a follow-up search_memories sees the new entry.
      // The disk write is local + serialized behind the main-process write
      // lock, so the added latency is small and the correctness win is large.
      const saved = await window.memory.add({
        content,
        source: 'model',
        sessionId: options.sessionId,
        scope,
      })
      notifyChange('Memory saved')
      return ok({
        kind: 'memory.added',
        id: saved.id,
        content: saved.content,
        updatedAt: saved.updatedAt,
      })
    }

    if (toolName === 'update_memory') {
      const id = typeof args.id === 'string' ? args.id : ''
      const content = typeof args.content === 'string' ? args.content : ''
      if (!id) return fail('update_memory requires `id`.')
      if (!content.trim()) return fail('update_memory requires non-empty `content`.')
      const existing = (await window.memory.list(scope)).find((memory) => memory.id === id)
      if (!existing) return fail(`No memory with id "${id}".`)
      const updated = await window.memory.update(id, { content })
      if (!updated) return fail(`Failed to update memory "${id}".`)
      notifyChange('Memory updated')
      return ok({
        kind: 'memory.updated',
        id: updated.id,
        content: updated.content,
        previousContent: existing.content,
        updatedAt: updated.updatedAt,
      })
    }

    if (toolName === 'delete_memory') {
      const id = typeof args.id === 'string' ? args.id : ''
      if (!id) return fail('delete_memory requires `id`.')
      const existing = (await window.memory.list(scope)).find((memory) => memory.id === id)
      if (!existing) return fail(`No memory with id "${id}".`)
      const deleted = await window.memory.delete(id)
      if (!deleted) return fail(`Failed to delete memory "${id}".`)
      notifyChange('Memory removed')
      return ok({
        kind: 'memory.deleted',
        id,
        previousContent: existing.content,
      })
    }

    if (toolName === 'search_memories') {
      const query = typeof args.query === 'string' ? args.query : ''
      const rawLimit = typeof args.limit === 'number' ? args.limit : 5
      const limit = Math.max(1, Math.min(20, Math.round(rawLimit)))
      if (!query.trim()) return fail('search_memories requires a non-empty `query`.')
      const matches = await window.memory.search(query, limit, scope)
      return ok({
        kind: 'memory.searched',
        query,
        matches: matches.map((memory) => ({
          id: memory.id,
          content: memory.content,
          updatedAt: memory.updatedAt,
        })),
      })
    }

    return fail(`Unknown memory tool: ${toolName as string}`)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unknown memory tool error')
  }
}

/**
 * Type guard for memory tool events on a `ToolResult.data` payload. Used by
 * the inline pill component to filter `toolResults` to memory events only.
 */
export function isMemoryToolEvent(value: unknown): value is MemoryToolEvent {
  if (!value || typeof value !== 'object') return false
  const kind = (value as { kind?: unknown }).kind
  return (
    kind === 'memory.added' ||
    kind === 'memory.updated' ||
    kind === 'memory.deleted' ||
    kind === 'memory.searched'
  )
}
