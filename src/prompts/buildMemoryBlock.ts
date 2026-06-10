import type { Memory, MemoryScope } from '@/electron/types'
import { defaultMemoryPrompt } from './defaultMemoryPrompt'

/**
 * Approximate token-budget cap for the injected memory block. Mirrors the
 * "Model Set Context" approach used by ChatGPT — memories are short, so this
 * cap is generous; we truncate by dropping the oldest entries first when the
 * block exceeds the budget.
 *
 * Token count is estimated as `chars / 4` (a well-known rough heuristic for
 * English text). We don't need a real tokenizer here: the block is small and
 * the budget exists to prevent runaway growth, not to be byte-exact.
 */
export const MEMORY_BLOCK_TOKEN_BUDGET = 2000

const MEMORY_BLOCK_HEADER = `## Saved Memories (Model Set Context)
The user has shared the following memories. Use them to personalize your replies, but do not parrot them back unless the user asks. Treat them as durable facts unless the user contradicts them in the current conversation.`

const MEMORY_INSTRUCTION_DEFAULT = defaultMemoryPrompt

interface BuildMemoryBlockOptions {
  /**
   * Maximum estimated tokens the formatted block should consume. When
   * exceeded, oldest entries (by `updatedAt`) are dropped first.
   */
  tokenBudget?: number
  /**
   * Override the default memory instruction text. Used by callers that surface
   * a user-editable "Memory Prompt" in Settings → System Prompt. Empty/
   * whitespace-only values fall back to the default instruction.
   */
  instruction?: string
  /**
   * Custom logger for truncation warnings; defaults to `console.warn`. Tests
   * pass `() => undefined` to keep output quiet.
   */
  warn?: (message: string) => void
}

function formatDate(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10) // YYYY-MM-DD
}

function formatMemoryLine(memory: Memory): string {
  const date = formatDate(memory.updatedAt)
  return `- [${date}] ${memory.content.trim()}`
}

function estimateTokens(text: string): number {
  // Rough approximation; sufficient for budget enforcement.
  return Math.ceil(text.length / 4)
}

/**
 * Builds the formatted memory block injected into the system prompt.
 *
 * Filters memories by scope (v1 callers pass `{ type: 'global' }`), formats
 * them as dated bullets, and truncates oldest-first when the block would
 * exceed `tokenBudget`. Returns an empty string when no memories survive
 * filtering — callers should append the result without an extra delimiter so
 * the prompt stays clean when memory is empty or disabled.
 *
 * @param memories - Array of memories (typically the full set from window.memory.list).
 * @param scope - Active memory scope (global in v1; project scope reserved for projects feature).
 */
export function buildMemoryBlock(
  memories: Memory[],
  scope: MemoryScope = { type: 'global' },
  options: BuildMemoryBlockOptions = {}
): string {
  const rawInstruction = typeof options.instruction === 'string' ? options.instruction.trim() : ''
  const instruction = rawInstruction.length > 0 ? rawInstruction : MEMORY_INSTRUCTION_DEFAULT
  const safeMemories = Array.isArray(memories) ? memories : []

  // Scope filter — mirrors filterMemoriesByScope in the main-process store.
  // Project scope returns project + global; global scope returns only globals.
  const filtered = safeMemories.filter((memory) => {
    if (!memory || typeof memory.content !== 'string') return false
    if (memory.status === 'superseded') return false
    const trimmed = memory.content.trim()
    if (!trimmed) return false
    if (scope.type === 'global') return memory.scope.type === 'global'
    return (
      memory.scope.type === 'global' ||
      (memory.scope.type === 'project' && memory.scope.projectId === scope.projectId)
    )
  })

  // Empty list → emit nothing. With no saved memories there is no context to
  // inject, and the assistant no longer manages the list, so an empty block
  // adds zero value to the prompt.
  if (filtered.length === 0) {
    return ''
  }

  // Sort oldest-first for stable bullet ordering, but enforce budget by
  // dropping the oldest entries (so newest memories survive truncation).
  const ordered = [...filtered].sort((a, b) => a.updatedAt - b.updatedAt)

  const budget = options.tokenBudget ?? MEMORY_BLOCK_TOKEN_BUDGET
  const headerTokens = estimateTokens(MEMORY_BLOCK_HEADER)
  const instructionTokens = estimateTokens(instruction)
  let availableTokens = Math.max(budget - headerTokens - instructionTokens, 0)

  // Walk newest-to-oldest collecting lines that fit the budget; drop oldest
  // first when over budget.
  const reversed = [...ordered].reverse()
  const accepted: string[] = []
  let droppedCount = 0
  for (const memory of reversed) {
    const line = formatMemoryLine(memory)
    const lineTokens = estimateTokens(line) + 1 // +1 for newline overhead
    if (lineTokens > availableTokens) {
      droppedCount += 1
      continue
    }
    accepted.unshift(line)
    availableTokens -= lineTokens
  }
  if (droppedCount > 0) {
    const log = options.warn ?? ((message: string) => console.warn(message))
    log(`buildMemoryBlock: dropped ${droppedCount} oldest memor${droppedCount === 1 ? 'y' : 'ies'} to fit token budget (${budget})`)
  }
  if (accepted.length === 0) {
    return ''
  }

  const list = `${MEMORY_BLOCK_HEADER}\n${accepted.join('\n')}`
  return `${list}\n\n${instruction}`
}

/**
 * Convenience wrapper that fetches memories from `window.memory` and builds
 * the formatted block, gated by `settings.memoryEnabled`. Used by the chat
 * send pipeline. Returns an empty string when:
 * - memory is disabled in settings,
 * - the renderer isn't running inside Electron (no window.memory bridge),
 * - the IPC call fails.
 *
 * Forward-compat note: the current build always passes `{ type: 'global' }`.
 * Once projects/folders ship, callers should thread the active project id
 * through this helper (e.g. `loadMemoryBlock(settings, { type: 'project', projectId })`).
 */
/**
 * Default number of memories injected into the prompt. Token efficiency: we
 * inject a small relevant subset instead of the entire store.
 */
export const MEMORY_INJECT_TOP_K = 8

/**
 * Convenience wrapper that selects a token-efficient subset of memories and
 * builds the formatted block, gated by `settings.skills.memory`.
 *
 * Selection:
 * - When `options.userMessage` is provided, retrieve the top-K most relevant
 *   memories via the main-process multi-signal scorer (`window.memory.search`),
 *   which already excludes superseded entries. This avoids injecting the whole
 *   store on every turn.
 * - Otherwise use the most-recent K memories from `window.memory.list`.
 *
 * Returns an empty string when memory is disabled, the bridge is missing, or
 * the IPC call fails.
 *
 * Forward-compat: pass a project scope once projects/folders ship.
 */
export async function loadMemoryBlock(
  settings: {
    /** Skills map; memory is gated by `skills.memory.enabled`. */
    skills?: import('@/skills').SkillsSettings
    /** Optional user-edited memory instruction text from System Prompt settings. */
    memoryPrompt?: string
  },
  scope: MemoryScope = { type: 'global' },
  options: { userMessage?: string; limit?: number } = {}
): Promise<string> {
  const { isSkillEnabled } = await import('@/skills')
  if (!isSkillEnabled(settings.skills, 'memory')) return ''
  if (typeof window === 'undefined' || !window.memory) return ''
  const limit = options.limit && options.limit > 0 ? options.limit : MEMORY_INJECT_TOP_K
  const query = typeof options.userMessage === 'string' ? options.userMessage.trim() : ''
  try {
    let memories: Memory[]
    if (query && typeof window.memory.search === 'function') {
      // Retrieve the top-K relevant memories (multi-signal scorer, main process).
      memories = await window.memory.search(query, limit, scope)
    } else {
      memories = (await window.memory.list(scope)).slice(0, limit)
    }
    return buildMemoryBlock(memories, scope, {
      instruction: settings.memoryPrompt,
    })
  } catch (error) {
    console.warn('Failed to load memories for prompt injection:', error)
    return ''
  }
}
