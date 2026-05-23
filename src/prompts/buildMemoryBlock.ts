import type { Memory, MemoryScope } from '@/electron/types'

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

const MEMORY_AUTOSAVE_INSTRUCTION = `Memory tools are available — you can manage the saved-memories list yourself.
- When the user shares a durable fact about themselves that would help future conversations, call \`save_memory\` with a short one-sentence summary. Examples: "User studies at MIT", "User prefers TypeScript over JavaScript", "User is building an Electron app called ZuraAI", "User's preferred name is Nikhil".
- Save things naturally as they come up; do not announce that you are saving (the UI already shows a "Memory updated" pill).
- Save at most 1–2 memories per turn. Prefer one good summary over many small ones. If a fact already exists in the list above (or is a refinement of an existing entry), call \`update_memory\` instead of duplicating.
- Do NOT save: the current task, one-off questions, transient state, anything sensitive (passwords, API keys, private credentials, financial details), or anything the user asks you not to remember.
- If the user explicitly asks "remember X", save it. If the user asks you to forget something, call \`delete_memory\`.`

const EMPTY_LIST_PLACEHOLDER = '_(no saved memories yet)_'

interface BuildMemoryBlockOptions {
  /**
   * Maximum estimated tokens the formatted block should consume. When
   * exceeded, oldest entries (by `updatedAt`) are dropped first.
   */
  tokenBudget?: number
  /**
   * When true, includes the ChatGPT-style "save_memory when the user shares
   * durable facts" instruction in the block header. Surface this whenever
   * the four memory tools are exposed (i.e. `settings.autoMemoryEnabled`),
   * so the model is reminded to save passively-mentioned facts even when
   * the saved-memories list is empty.
   */
  autoSaveEnabled?: boolean
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
  const autoSaveEnabled = options.autoSaveEnabled === true
  const safeMemories = Array.isArray(memories) ? memories : []

  // Scope filter — mirrors filterMemoriesByScope in the main-process store.
  // Project scope returns project + global; global scope returns only globals.
  const filtered = safeMemories.filter((memory) => {
    if (!memory || typeof memory.content !== 'string') return false
    const trimmed = memory.content.trim()
    if (!trimmed) return false
    if (scope.type === 'global') return memory.scope.type === 'global'
    return (
      memory.scope.type === 'global' ||
      (memory.scope.type === 'project' && memory.scope.projectId === scope.projectId)
    )
  })

  // Empty list:
  // - autoSave on  → still emit the header + empty-list note + autosave instructions,
  //                  so the model gets the nudge to save things from the very first turn.
  // - autoSave off → emit nothing; an empty memory block adds zero value to the prompt.
  if (filtered.length === 0) {
    if (!autoSaveEnabled) return ''
    return `${MEMORY_BLOCK_HEADER}\n${EMPTY_LIST_PLACEHOLDER}\n\n${MEMORY_AUTOSAVE_INSTRUCTION}`
  }

  // Sort oldest-first for stable bullet ordering, but enforce budget by
  // dropping the oldest entries (so newest memories survive truncation).
  const ordered = [...filtered].sort((a, b) => a.updatedAt - b.updatedAt)

  const budget = options.tokenBudget ?? MEMORY_BLOCK_TOKEN_BUDGET
  const headerTokens = estimateTokens(MEMORY_BLOCK_HEADER)
  const autosaveTokens = autoSaveEnabled ? estimateTokens(MEMORY_AUTOSAVE_INSTRUCTION) : 0
  let availableTokens = Math.max(budget - headerTokens - autosaveTokens, 0)

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
    if (!autoSaveEnabled) return ''
    return `${MEMORY_BLOCK_HEADER}\n${EMPTY_LIST_PLACEHOLDER}\n\n${MEMORY_AUTOSAVE_INSTRUCTION}`
  }

  const list = `${MEMORY_BLOCK_HEADER}\n${accepted.join('\n')}`
  return autoSaveEnabled ? `${list}\n\n${MEMORY_AUTOSAVE_INSTRUCTION}` : list
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
export async function loadMemoryBlock(
  settings: { memoryEnabled?: boolean; autoMemoryEnabled?: boolean },
  scope: MemoryScope = { type: 'global' }
): Promise<string> {
  if (!settings.memoryEnabled) return ''
  if (typeof window === 'undefined' || !window.memory) return ''
  const autoSaveEnabled = settings.autoMemoryEnabled !== false
  try {
    const memories = await window.memory.list(scope)
    return buildMemoryBlock(memories, scope, { autoSaveEnabled })
  } catch (error) {
    console.warn('Failed to load memories for prompt injection:', error)
    return ''
  }
}
