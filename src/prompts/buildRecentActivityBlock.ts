import type { ConversationSummary } from '@/electron/types'

/**
 * "Recent activity" — Layer 2 of the memory system (ChatGPT's reference-chat-
 * history equivalent). A compact, pre-computed list of one-line summaries of
 * recent chats, injected near the top of the system prompt so new
 * conversations carry continuity without RAG.
 *
 * Token-efficient by construction: each summary is one short line and the
 * store caps the window (SUMMARY_CAP). We additionally cap the number injected
 * here.
 */

export const RECENT_ACTIVITY_MAX_ITEMS = 10

const HEADER = `## Recent Activity
A brief, dated list of what the user has been working on across recent chats. Use it for continuity and context; do not bring it up unless relevant.`

function formatDate(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

/** Build the formatted recent-activity block, or '' when there is nothing to show. */
export function buildRecentActivityBlock(
  summaries: ConversationSummary[],
  maxItems: number = RECENT_ACTIVITY_MAX_ITEMS
): string {
  const safe = Array.isArray(summaries) ? summaries : []
  const items = safe
    .filter((s) => s && typeof s.summary === 'string' && s.summary.trim().length > 0)
    .slice(0, Math.max(0, maxItems))
  if (items.length === 0) return ''
  const lines = items.map((s) => `- [${formatDate(s.updatedAt)}] ${s.summary.trim()}`)
  return `${HEADER}\n${lines.join('\n')}`
}

/**
 * Fetch recent conversation summaries from the bridge and build the block.
 * Gated by the Memory skill. Returns '' when disabled, the bridge is missing,
 * or the IPC call fails.
 */
export async function loadRecentActivityBlock(settings: {
  skills?: import('@/skills').SkillsSettings
}): Promise<string> {
  const { isSkillEnabled } = await import('@/skills')
  if (!isSkillEnabled(settings.skills, 'memory')) return ''
  if (typeof window === 'undefined' || !window.memory?.summaries) return ''
  try {
    const summaries = await window.memory.summaries.list()
    return buildRecentActivityBlock(summaries)
  } catch (error) {
    console.warn('Failed to load recent activity for prompt injection:', error)
    return ''
  }
}
