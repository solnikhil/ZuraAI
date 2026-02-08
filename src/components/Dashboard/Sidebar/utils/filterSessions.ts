import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

/**
 * Filters chat sessions by matching a search query against session titles
 * and the content of the last 20 messages (case-insensitive).
 *
 * - Empty or whitespace-only queries return all sessions unfiltered.
 * - Title match: case-insensitive substring match against session title.
 * - Content match: case-insensitive substring match against the last 20 messages' content.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5
 */
export function filterSessions(
  sessions: ChatSession[],
  query: string
): ChatSession[] {
  if (!query.trim()) return sessions

  const lower = query.toLowerCase()

  return sessions.filter(s => {
    // Title match (case-insensitive)
    if (s.title.toLowerCase().includes(lower)) return true

    // Full-text: search last 20 messages for content match
    const recentMessages = s.messages.slice(-20)
    return recentMessages.some(m => m.content.toLowerCase().includes(lower))
  })
}
