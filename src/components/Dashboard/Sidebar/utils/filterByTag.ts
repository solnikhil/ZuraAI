import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

/**
 * Filters chat sessions by a specific tag.
 *
 * Returns only sessions whose `tags` array includes the given tag.
 * Sessions with undefined or missing `tags` are treated as having an empty
 * array and will not match any tag filter.
 *
 */
export function filterByTag(sessions: ChatSession[], tag: string): ChatSession[] {
  return sessions.filter((s) => {
    const tags = s.tags ?? []
    return tags.includes(tag)
  })
}
