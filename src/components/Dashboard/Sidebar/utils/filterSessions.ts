import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

/**
 * Filters chat sessions by matching a search query against session titles
 * and the content of all messages (case-insensitive).
 *
 * - Empty or whitespace-only queries return all sessions unfiltered.
 * - Title match: case-insensitive substring match against session title.
 * - Content match: case-insensitive substring match against all messages' content.
 *
 */
export function filterSessions(sessions: ChatSession[], query: string): ChatSession[] {
  if (!query.trim()) return sessions

  const lower = query.toLowerCase()

  return sessions.filter((s) => {
    // Title match (case-insensitive)
    if (s.title.toLowerCase().includes(lower)) return true

    // Full-text: search all messages for content match
    return s.messages.some((m) => m.content.toLowerCase().includes(lower))
  })
}

/**
 * Returns a snippet preview from the first matching message in a session.
 * Shows the role label ("You" / "Assistant") and a truncated excerpt
 * centred around the first match occurrence.
 *
 * Returns null if no message content matches (e.g. title-only match).
 */
export function getMatchSnippet(
  session: ChatSession,
  query: string,
  maxLength = 80
): { role: string; snippet: string } | null {
  if (!query.trim()) return null

  const lower = query.toLowerCase()

  const match = session.messages.find((m) => m.content.toLowerCase().includes(lower))
  if (!match) return null

  const role = match.role === 'user' ? 'You' : match.role === 'assistant' ? 'Assistant' : 'System'
  const content = match.content
  const idx = content.toLowerCase().indexOf(lower)

  // Centre the snippet around the match
  const halfWindow = Math.floor((maxLength - query.length) / 2)
  let start = Math.max(0, idx - halfWindow)
  let end = Math.min(content.length, idx + query.length + halfWindow)

  // Adjust if near the edges
  if (start === 0) {
    end = Math.min(content.length, maxLength)
  } else if (end === content.length) {
    start = Math.max(0, content.length - maxLength)
  }

  let snippet = content.slice(start, end).trim()
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'

  return { role, snippet }
}
